#!/usr/bin/env bash
# First installation only. Existing deployments are never overwritten.
set -Eeuo pipefail
umask 077

if [[ $# -ne 3 || $EUID -ne 0 ]]; then
  printf 'Usage (as root): install-internal.sh <unpacked-package> <version> <pause-arl|keep-arl>\n' >&2
  exit 1
fi
package=$1
version=$2
pause_mode=$3
[[ $version =~ ^[a-z0-9][a-z0-9_.-]{0,80}$ ]] || { printf 'Invalid version\n' >&2; exit 1; }
[[ $pause_mode == pause-arl || $pause_mode == keep-arl ]] || exit 1
root=/opt/campus-internal
[[ ! -e $root ]] || { printf '%s already exists. Inspect the previous installation before retrying.\n' "$root" >&2; exit 1; }
for tool in docker curl ss awk; do command -v "$tool" >/dev/null || exit 1; done
docker info --format 'Docker server {{.ServerVersion}}'
docker compose version
[[ -z $(docker ps -aq --filter label=com.docker.compose.project=campus-internal) ]] || { printf 'Existing campus-internal containers found.\n' >&2; exit 1; }
[[ -z $(docker volume ls -q --filter label=com.docker.compose.project=campus-internal) ]] || { printf 'Existing campus-internal volumes found.\n' >&2; exit 1; }
[[ -z $(ss -H -lnt '( sport = :18080 )') ]] || { printf 'Port 18080 is already occupied.\n' >&2; exit 1; }
for file in server.env wechat.env db-password mysql-root-password initial-admin-password; do
  [[ -s $package/bootstrap/$file && ! -L $package/bootstrap/$file ]] || { printf 'Missing bootstrap configuration.\n' >&2; exit 1; }
done
[[ -f $package/app/deploy/internal.compose.yaml ]] || exit 1

install -d -m 700 "$root" "$root/state" "$root/secrets"
cp -a "$package/app" "$root/app"
find "$root/app" -type d -exec chmod 755 {} +
find "$root/app" -type f -exec chmod 644 {} +
for file in server.env wechat.env db-password mysql-root-password initial-admin-password; do
  install -m 600 "$package/bootstrap/$file" "$root/secrets/$file"
done
# The private parent stays 700; bind-mounted secret files must be readable by the container users.
chmod 444 "$root/secrets/db-password" "$root/secrets/mysql-root-password"
chmod 600 "$root/secrets/server.env" "$root/secrets/wechat.env" "$root/secrets/initial-admin-password"
printf 'APP_VERSION=%s\nSECRETS_DIR=%s/secrets\n' "$version" "$root" > "$root/secrets/compose.env"
dc() { docker compose --env-file "$root/secrets/compose.env" -f "$root/app/deploy/internal.compose.yaml" "$@"; }
paused=0
finished=0
cleanup() {
  status=$?
  if [[ $status -ne 0 && $finished -eq 0 ]]; then
    printf '\nInstallation failed. Stopping only campus-internal containers; preserving its files and database.\n' >&2
    dc stop --timeout 30 || true
    if [[ $paused -eq 1 ]]; then
      bash "$root/app/deploy/resume-arl.sh" || printf 'Automatic ARL resume failed. Review %s/state/arl-before.tsv.\n' "$root" >&2
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
dc config --quiet

if [[ $pause_mode == pause-arl ]]; then
  # Record every target before stopping any. Never run compose down, prune or remove volumes.
  for name in arl_web arl_worker arl_scheduler arl_mongodb arl_rabbitmq; do
    docker inspect --format '{{.Id}} {{.Name}} {{.State.Running}} {{.HostConfig.RestartPolicy.Name}}' "$name" |
      awk '{sub(/^\//,"",$2); printf "%s\t%s\t%s\t%s\n",$1,$2,$3,$4}' >> "$root/state/arl-before.tsv"
  done
  [[ $(wc -l < "$root/state/arl-before.tsv") -eq 5 ]] || exit 1
  paused=1
  for name in arl_web arl_worker arl_scheduler arl_mongodb arl_rabbitmq; do
    id=$(awk -F '\t' -v name="$name" '$2 == name && $3 == "true" {print $1}' "$root/state/arl-before.tsv")
    if [[ -n $id ]]; then docker stop --timeout 30 "$id"; fi
  done
fi

available_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
printf 'Available memory after preflight: %s MiB\n' "$((available_kb / 1024))"
if (( available_kb < 1024000 )); then
  printf 'Less than 1000 MiB available. Refusing deployment and restoring paused services.\n' >&2
  exit 1
fi
export COMPOSE_PARALLEL_LIMIT=1
dc build api
dc build admin
dc up -d --wait --wait-timeout 180 db
dc run --rm --no-deps api node src/db/migrate.js
ADMIN_PASSWORD=$(cat "$root/secrets/initial-admin-password")
export ADMIN_PASSWORD
dc run --rm --no-deps -e ADMIN_PASSWORD api node src/scripts/create-admin.js
unset ADMIN_PASSWORD
dc up -d --wait --wait-timeout 180
ready=$(curl --fail --silent --show-error http://127.0.0.1:18080/ready)
[[ $ready == '{"status":"ready"}' ]] || { printf 'Unexpected readiness response.\n' >&2; exit 1; }
dc ps
mapfile -t app_containers < <(dc ps -q)
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}' "${app_containers[@]}"
free -m
ss -lnt '( sport = :18080 )'
touch "$root/state/install-complete"
finished=1
printf '\nCAMPUS_INSTALL_COMPLETE: cloud readiness passed; SSH tunnel and real phones still need verification.\n'
