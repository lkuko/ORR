#!/usr/bin/env bash
# Rotate only the WeChat credentials and Compose file. Preserve DB, admin, and token secret.
set -Eeuo pipefail
umask 077

if [[ $# -ne 2 || $EUID -ne 0 ]]; then
  printf 'Usage (as root): rotate-wechat.sh <package-dir> <expected-app-id>\n' >&2
  exit 1
fi
package=$1
expected_app_id=$2
root=/opt/campus-internal
[[ $expected_app_id =~ ^wx[a-f0-9]{16}$ ]] || { printf 'Invalid WeChat AppID format.\n' >&2; exit 1; }
[[ -f $root/state/install-complete && -f $root/secrets/compose.env && -f $root/secrets/server.env && -f $root/app/deploy/internal.compose.yaml ]] || { printf 'Campus installation is not marked complete.\n' >&2; exit 1; }
[[ -f $package/deploy/internal.compose.yaml && -f $package/deploy/rotate-wechat.sh && -f $package/deploy/rollback-wechat.sh ]] || exit 1
[[ -f $package/wechat.env && ! -L $package/wechat.env ]] || exit 1

[[ $(wc -l < "$package/wechat.env") -eq 2 ]] &&
  grep -Fxq "WECHAT_APP_ID=\"$expected_app_id\"" "$package/wechat.env" &&
  grep -Eq '^WECHAT_APP_SECRET="[A-Za-z0-9]{16,128}"$' "$package/wechat.env" || {
  printf 'Credential package validation failed.\n' >&2
  exit 1
}

stamp=$(date -u +%Y%m%d%H%M%S)
backup=$root/state/wechat-rotation-$stamp
[[ ! -e $backup && ! -L $backup ]] || exit 1
install -d -m 700 "$backup"
cp -p "$root/app/deploy/internal.compose.yaml" "$backup/internal.compose.yaml"
cp -p "$root/secrets/server.env" "$backup/server.env"
install -m 600 "$package/deploy/rollback-wechat.sh" "$backup/rollback-wechat.sh"
if [[ -e $root/secrets/wechat.env ]]; then
  cp -p "$root/secrets/wechat.env" "$backup/wechat.env"
else
  touch "$backup/wechat.env.missing"
fi

dc() { docker compose --env-file "$root/secrets/compose.env" -f "$root/app/deploy/internal.compose.yaml" "$@"; }
finished=0
rollback() {
  status=$?
  if [[ $status -ne 0 && $finished -eq 0 ]]; then
    printf 'WeChat rotation failed; restoring previous app configuration.\n' >&2
    bash "$backup/rollback-wechat.sh" "$backup" || printf 'Automatic rollback failed; recovery files are in %s\n' "$backup" >&2
  fi
  exit "$status"
}
trap rollback EXIT

server_tmp=$root/secrets/server.env.rotation-$stamp
awk '!/^WECHAT_APP_(ID|SECRET)=/' "$root/secrets/server.env" > "$server_tmp"
chmod 600 "$server_tmp"
mv -f -- "$server_tmp" "$root/secrets/server.env"
install -m 600 "$package/wechat.env" "$root/secrets/wechat.env"
install -m 644 "$package/deploy/internal.compose.yaml" "$root/app/deploy/internal.compose.yaml"
dc config --quiet
dc up -d --no-deps --force-recreate --wait --wait-timeout 120 api
# Nginx resolves its upstream on startup/reload; the recreated API may have a new IP.
dc exec -T admin nginx -t < /dev/null
dc exec -T admin nginx -s reload < /dev/null
ready=$(curl --fail --silent --show-error --connect-timeout 3 --max-time 10 --retry 3 --retry-delay 1 http://127.0.0.1:18080/ready)
[[ $ready == '{"status":"ready"}' ]] || { printf 'API readiness failed after rotation.\n' >&2; exit 1; }
dc exec -T api node - "$expected_app_id" <<'NODE'
// Validate credentials with WeChat without logging the secret, access token or response body.
(async () => {
  if (process.env.WECHAT_APP_ID !== process.argv[2] || !process.env.WECHAT_APP_SECRET) throw new Error('CONFIG_MISMATCH')
  const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credential', appid: process.env.WECHAT_APP_ID, secret: process.env.WECHAT_APP_SECRET, force_refresh: false }),
    signal: AbortSignal.timeout(10000)
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) {
    console.error('WECHAT_CREDENTIAL_CHECK_FAILED: code=' + (Number.isInteger(data.errcode) ? data.errcode : response.status))
    process.exitCode = 1
    return
  }
  console.log('WECHAT_CREDENTIAL_CHECK_PASSED')
})().catch(() => { console.error('WECHAT_CREDENTIAL_CHECK_FAILED: connection or configuration error'); process.exitCode = 1 })
NODE
install -m 644 "$package/deploy/rollback-wechat.sh" "$root/app/deploy/rollback-wechat.sh"
finished=1
printf 'CAMPUS_WECHAT_ROTATION_COMPLETE: AppID=%s, API healthy, database and TOKEN_SECRET preserved.\n' "$expected_app_id"
printf 'Rollback files retained at %s\n' "$backup"
