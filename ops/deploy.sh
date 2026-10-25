#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/opt/imi-wordcloud
release=${1:?Commit SHA required}
[[ $release =~ ^[0-9a-f]{40}$ ]] || exit 2
exec 9>"$root/shared/deploy.lock"
flock -n 9 || { echo 'Deployment already running'; exit 1; }
cd "$root/releases/$release"
export RELEASE=$release
compose=(docker compose --env-file "$root/shared/compose.env" -f compose.production.yaml)
previous=$(cat "$root/shared/current-release" 2>/dev/null || true)
if [[ $previous == "$release" ]]; then
  curl -fsS --max-time 10 http://127.0.0.1:3000/api/ready >/dev/null
  echo 'Release already active; previous rollback target retained'
  exit 0
fi
# No traffic is changed before a backup and successful migration.
"${compose[@]}" up -d --wait db
if [[ -n $previous ]]; then
  if [[ -f "$root/shared/backup.env" ]]; then
    "$root/current/ops/backup.sh"
  else
    proof=$(cat "$root/shared/offsite-backup-$release" 2>/dev/null || true)
    [[ $proof =~ ^https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/[0-9]+/artifacts/[0-9]+$ ]] || { echo 'Verified off-site backup required before deployment'; exit 1; }
    echo 'Verified encrypted off-site Actions backup recorded for this release'
  fi
fi
# Migrations must be additive/backward compatible with the previous app release.
"${compose[@]}" run --rm -T tools
rollback() {
  if [[ -n $previous ]]; then
    export RELEASE=$previous
    cd "$root/releases/$previous"
    docker compose --env-file "$root/shared/compose.env" -f compose.production.yaml up -d --wait --wait-timeout 120 app
    echo "Rolled application back to $previous; database retained"
  else
    "${compose[@]}" stop app
    echo 'Initial release failed; database retained'
  fi
}
if ! "${compose[@]}" up -d --wait --wait-timeout 120 app; then rollback; exit 1; fi
if ! curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/ready >/dev/null; then rollback; exit 1; fi
ln -sfn "$root/releases/$release" "$root/current.new"
mv -Tf "$root/current.new" "$root/current"
printf '%s\n' "$release" > "$root/shared/current-release"
printf '%s\n' "$previous" > "$root/shared/previous-release"
echo "Release $release ready; verify public HTTPS separately"
# Never run docker volume prune or down -v. Retain previous images for rollback.
