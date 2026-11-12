#!/usr/bin/env bash
# Verify the initial internal deployment before clients start writing data.
set -Eeuo pipefail
umask 077
root=/opt/campus-internal
[[ $EUID -eq 0 && -f $root/state/install-complete ]] || { printf 'A completed campus installation is required.\n' >&2; exit 1; }
dc() { docker compose --env-file "$root/secrets/compose.env" -f "$root/app/deploy/internal.compose.yaml" "$@"; }
mysql_query() {
  dc exec -T db sh -c 'export MYSQL_PWD="$(cat /run/secrets/mysql_root_password)"; exec mysql --default-character-set=utf8mb4 -uroot "$@"' sh "$@" < /dev/null
}
dump_database() {
  dc exec -T db sh -c 'export MYSQL_PWD="$(cat /run/secrets/mysql_root_password)"; exec mysqldump --default-character-set=utf8mb4 -uroot "$@"' sh "$@" < /dev/null
}
[[ $(curl --fail --silent --show-error http://127.0.0.1:18080/ready) == '{"status":"ready"}' ]] || exit 1
dc ps
printf '\nARL_CONTAINER_STATE:\n'
for name in arl_web arl_worker arl_scheduler arl_mongodb arl_rabbitmq; do
  docker inspect --format '{{.Name}} running={{.State.Running}}' "$name"
done
printf '\nLISTENER_STATE:\n'
ss -lnt '( sport = :18080 )'

install -d -m 700 "$root/backups"
work=$(mktemp -d "$root/backups/verify.XXXXXX")
stamp=$(date -u +%Y%m%d%H%M%S)
restore=campus_internal_restore_${stamp}_${RANDOM}
backup=$root/backups/campus-internal-${stamp}-${RANDOM}.sql.gz
created=0
cleanup() {
  status=$?
  if [[ $created -eq 1 && $restore =~ ^campus_internal_restore_[0-9]{14}_[0-9]+$ ]]; then
    if ! mysql_query -e "DROP DATABASE \`$restore\`"; then
      printf 'Temporary restore database cleanup failed: %s\n' "$restore" >&2
      status=1
    fi
  fi
  case "$work" in /opt/campus-internal/backups/verify.*) rm -rf -- "$work" ;; esac
  exit "$status"
}
trap cleanup EXIT
[[ ! -e $backup ]] || exit 1
dump_database --single-transaction --no-tablespaces --set-gtid-purged=OFF --routines --events --triggers --hex-blob campus_internal |
  gzip > "$backup"
gzip -t "$backup"
mysql_query -e "CREATE DATABASE \`$restore\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
created=1
gzip -dc "$backup" |
  dc exec -T db sh -c 'export MYSQL_PWD="$(cat /run/secrets/mysql_root_password)"; exec mysql --default-character-set=utf8mb4 -uroot "$1"' sh "$restore"

mysql_query --batch --skip-column-names -e 'SHOW TABLES FROM campus_internal' > "$work/source-tables"
mysql_query --batch --skip-column-names -e "SHOW TABLES FROM \`$restore\`" > "$work/restored-tables"
cmp -s "$work/source-tables" "$work/restored-tables" || { printf 'Restored table list differs.\n' >&2; exit 1; }
while IFS= read -r table; do
  [[ $table =~ ^[a-z_][a-z0-9_]*$ ]] || { printf 'Unexpected table name.\n' >&2; exit 1; }
  original_count=$(mysql_query --batch --skip-column-names -e "SELECT COUNT(*) FROM campus_internal.\`$table\`")
  restored_count=$(mysql_query --batch --skip-column-names -e "SELECT COUNT(*) FROM \`$restore\`.\`$table\`")
  [[ $original_count == "$restored_count" ]] || { printf 'Restored row count differs: %s\n' "$table" >&2; exit 1; }
  printf 'RESTORE_ROWS_MATCH: %s %s\n' "$table" "$original_count"
done < "$work/source-tables"

# Compare canonical data dumps without printing row contents or credential hashes.
data_options=(--single-transaction --no-tablespaces --set-gtid-purged=OFF --no-create-info --skip-triggers --skip-comments --skip-add-locks --skip-disable-keys --skip-extended-insert --complete-insert --order-by-primary --hex-blob)
dump_database "${data_options[@]}" campus_internal > "$work/source-data"
dump_database "${data_options[@]}" "$restore" > "$work/restored-data"
cmp -s "$work/source-data" "$work/restored-data" || { printf 'Restored data differs; check whether clients wrote during verification. Backup is preserved.\n' >&2; exit 1; }
mysql_query -e "DROP DATABASE \`$restore\`"
created=0
backup_hash=$(sha256sum "$backup" | cut -d ' ' -f 1)
printf 'BACKUP_RESTORE_VERIFIED: %s sha256=%s\n' "$backup" "$backup_hash"
printf 'BACKUP_RESTORE_VERIFIED: %s sha256=%s\n' "$backup" "$backup_hash" > "$root/state/backup-verified"
printf '\nCURRENT_MEMORY:\n'
free -m
case "$work" in /opt/campus-internal/backups/verify.*) rm -rf -- "$work" ;; esac
trap - EXIT
printf 'CAMPUS_CLOUD_VERIFIED: readiness, backup and isolated restore checks passed.\n'
