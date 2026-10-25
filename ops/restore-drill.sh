#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/opt/imi-wordcloud
set -a
source "$root/shared/backup.env"
set +a
work=$(mktemp -d)
name=imi-restore-$(date +%s)-$$
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
# Restore in an isolated throwaway database. Never overwrite production.
restic dump --tag imi-wordcloud latest /postgres.dump > "$work/database.dump"
docker run -d --name "$name" --network none --memory 512m -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-bookworm >/dev/null
for i in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$name" pg_restore --exit-on-error --no-owner -U postgres -d postgres < "$work/database.dump"
docker exec "$name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS events FROM events; SELECT count(*) AS answers FROM submissions;'
echo 'Restore drill complete. Compare counts with backup-time evidence before declaring recovery verified.'
