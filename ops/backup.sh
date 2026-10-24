#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/opt/imi-wordcloud
exec 8>"$root/shared/backup.lock"
flock -w 300 8
# root/deploy readable file, contains RESTIC_REPOSITORY, RESTIC_PASSWORD_FILE,
# and optional provider credentials. Never source data received from participants.
set -a
source "$root/shared/backup.env"
set +a
: "${RESTIC_REPOSITORY:?Configure an off-VPS repository}"
: "${RESTIC_PASSWORD_FILE:?Configure a password file}"
[[ $RESTIC_REPOSITORY != /* && $RESTIC_REPOSITORY != local:* ]] || { echo 'Off-VPS backup required'; exit 1; }
cd "$root/current"
release=$(cat "$root/shared/current-release")
export RELEASE=$release
# Publish the recoverable tag only after BOTH pg_dump and restic succeed.
# A truncated stream can otherwise produce an apparently successful restic snapshot.
result=$(mktemp)
trap 'rm -f "$result"' EXIT
if ! docker compose --env-file "$root/shared/compose.env" -f compose.production.yaml exec -T db pg_dump -U mir -d mir_wordcloud -Fc | restic backup --json --stdin --stdin-filename postgres.dump --tag imi-wordcloud-pending > "$result"; then
  failed=$(jq -r 'select(.message_type == "summary") | .snapshot_id // empty' "$result" | tail -1)
  if [[ $failed =~ ^[0-9a-f]{8,64}$ ]]; then restic forget "$failed"; fi
  echo 'Backup failed; no recoverable snapshot published' >&2
  exit 1
fi
snapshot=$(jq -r 'select(.message_type == "summary") | .snapshot_id // empty' "$result" | tail -1)
[[ $snapshot =~ ^[0-9a-f]{8,64}$ ]] || { echo 'Missing snapshot ID'; exit 1; }
restic tag --add imi-wordcloud --remove imi-wordcloud-pending "$snapshot"
# Prune only this application's backups. Do not prune other repositories/tags.
restic forget --tag imi-wordcloud --group-by tags --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune
restic check
