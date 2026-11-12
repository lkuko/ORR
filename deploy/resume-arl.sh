#!/usr/bin/env bash
set -euo pipefail
root=/opt/campus-internal
state=$root/state/arl-before.tsv
[[ $EUID -eq 0 && -f $state ]] || { printf 'Root access and the recorded ARL state are required.\n' >&2; exit 1; }
[[ -z $(docker ps -q --filter label=com.docker.compose.project=campus-internal) ]] || {
  printf 'Stop campus-internal first to avoid exhausting memory. No ARL containers were started.\n' >&2
  exit 1
}
for name in arl_mongodb arl_rabbitmq arl_worker arl_scheduler arl_web; do
  id=$(awk -F '\t' -v name="$name" '$2 == name && $3 == "true" {print $1}' "$state")
  [[ -n $id ]] || continue
  [[ $id =~ ^[a-f0-9]{64}$ ]] || { printf 'Invalid recorded container ID.\n' >&2; exit 1; }
  actual_name=$(docker inspect --format '{{.Name}}' "$id")
  [[ $actual_name == /"$name" ]] || { printf 'Container identity changed: %s\n' "$name" >&2; exit 1; }
  if [[ $(docker inspect --format '{{.State.Running}}' "$id") != true ]]; then docker start "$id"; fi
done
printf 'Previously running ARL containers were started. Application health still needs checking.\n'
