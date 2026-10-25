#!/usr/bin/env bash
set -Eeuo pipefail
root=/opt/imi-wordcloud
exec 9>"$root/shared/deploy.lock"
flock -n 9
old=$(cat "$root/shared/previous-release")
[[ $old =~ ^[0-9a-f]{40}$ ]] || { echo 'No previous release'; exit 1; }
cd "$root/releases/$old"
export RELEASE=$old
docker compose --env-file "$root/shared/compose.env" -f compose.production.yaml up -d --wait --wait-timeout 120 app
curl -fsS --max-time 10 http://127.0.0.1:3000/api/ready >/dev/null
ln -sfn "$root/releases/$old" "$root/current.new"
mv -Tf "$root/current.new" "$root/current"
printf '%s\n' "$old" > "$root/shared/current-release"
echo 'Application rollback complete; no database changes reverted'
