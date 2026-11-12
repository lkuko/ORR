#!/usr/bin/env bash
# Restore a known WeChat-rotation snapshot without changing database state.
set -Eeuo pipefail
umask 077

if [[ $# -ne 1 || $EUID -ne 0 ]]; then
  printf 'Usage (as root): rollback-wechat.sh <rotation-snapshot>\n' >&2
  exit 1
fi
root=/opt/campus-internal
backup=$(realpath -e -- "$1")
expected_root=$(realpath -e -- "$root/state")
[[ $backup == "$expected_root"/wechat-rotation-* && -d $backup ]] || { printf 'Snapshot is outside the campus state directory.\n' >&2; exit 1; }
[[ -f $backup/internal.compose.yaml && -f $backup/server.env ]] || exit 1
[[ -f $root/secrets/compose.env ]] || exit 1
[[ -f $backup/wechat.env.missing || -f $backup/wechat.env ]] || exit 1
cp -p "$backup/server.env" "$root/secrets/server.env.rollback"
mv -f -- "$root/secrets/server.env.rollback" "$root/secrets/server.env"
if [[ -f $backup/wechat.env.missing ]]; then
  rm -f -- "$root/secrets/wechat.env"
else
  [[ -f $backup/wechat.env ]] || exit 1
  cp -p "$backup/wechat.env" "$root/secrets/wechat.env.rollback"
  mv -f -- "$root/secrets/wechat.env.rollback" "$root/secrets/wechat.env"
fi
install -m 644 "$backup/internal.compose.yaml" "$root/app/deploy/internal.compose.yaml.rollback"
mv -f -- "$root/app/deploy/internal.compose.yaml.rollback" "$root/app/deploy/internal.compose.yaml"
dc() { docker compose --env-file "$root/secrets/compose.env" -f "$root/app/deploy/internal.compose.yaml" "$@"; }
dc config --quiet
dc up -d --no-deps --force-recreate --wait --wait-timeout 120 api
dc exec -T admin nginx -t < /dev/null
dc exec -T admin nginx -s reload < /dev/null
[[ $(curl --fail --silent --show-error --connect-timeout 3 --max-time 10 --retry 3 --retry-delay 1 http://127.0.0.1:18080/ready) == '{"status":"ready"}' ]]
printf 'CAMPUS_WECHAT_ROLLBACK_COMPLETE: previous API configuration restored; database preserved.\n'
