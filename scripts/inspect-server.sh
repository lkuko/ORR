#!/usr/bin/env bash
# Read-only inspection. Do not print environment files, credentials or process arguments.
set -u
printf '\n[system]\n'
hostname
uname -m
if [ -r /etc/os-release ]; then
  awk -F= '/^(PRETTY_NAME|ID|VERSION_ID)=/ { print }' /etc/os-release
fi
id
printf '\n[resources]\n'
getconf _NPROCESSORS_ONLN
free -m
df -h / /opt
printf '\n[listening_tcp_ports]\n'
if command -v ss >/dev/null 2>&1; then ss -lnt; fi
printf '\n[installed_tools]\n'
for tool in docker node npm mysql nginx curl tar; do
  command -v "$tool" || true
done
printf '\n[docker]\n'
if command -v docker >/dev/null 2>&1; then
  docker version --format 'Client={{.Client.Version}} Server={{if .Server}}{{.Server.Version}}{{end}}' 2>&1 || true
  docker compose version 2>&1 || true
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' 2>&1 || true
  printf '\n[container_resources]\n'
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' 2>&1 || true
fi
printf '\n[existing_project_directories]\n'
if [ -d /opt ]; then find /opt -mindepth 1 -maxdepth 1 -type d -print; fi
if [ -e /opt/campus-internal ]; then
  printf 'NOTICE: /opt/campus-internal already exists; inspect before deploying.\n'
fi
printf '\n[firewall]\n'
if command -v ufw >/dev/null 2>&1; then ufw status 2>&1 || true; fi
printf '\n[inspection_complete]\n'
