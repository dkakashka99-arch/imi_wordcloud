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
# pipefail prevents recording success for a failed pg_dump.
docker compose --env-file "$root/shared/compose.env" -f compose.production.yaml exec -T db pg_dump -U mir -d mir_wordcloud -Fc | restic backup --stdin --stdin-filename postgres.dump --tag imi-wordcloud
# Prune only this application's backups. Do not prune other repositories/tags.
restic forget --tag imi-wordcloud --group-by tags --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune
restic check
