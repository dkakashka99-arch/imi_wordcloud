#!/usr/bin/env bash
# Read-only inventory. No deploy, migrations, event changes or provider calls.
set -Eeuo pipefail
root=/opt/imi-wordcloud
release=$(cat "$root/shared/current-release")
[[ $release =~ ^[0-9a-f]{40}$ ]]
printf 'installed_sha=%s\n' "$release"
if test -f "$root/shared/previous-release"; then
  previous=$(cat "$root/shared/previous-release")
  [[ $previous =~ ^[0-9a-f]{40}$ ]] && printf 'rollback_sha=%s\n' "$previous"
fi
cd "$root/releases/$release"
export RELEASE=$release
compose=(docker compose --env-file "$root/shared/compose.env" -f compose.production.yaml)
app=$("${compose[@]}" ps -q app)
db=$("${compose[@]}" ps -q db)
docker --version
docker compose version
docker exec "$db" postgres --version
for container in "$app" "$db"; do
  docker inspect --format 'image={{.Config.Image}} status={{.State.Status}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' "$container"
  docker stats --no-stream --format 'container={{.Name}} memory={{.MemUsage}} cpu={{.CPUPerc}}' "$container"
done
df -Pk "$root"
free -m
docker exec -i "$app" node --input-type=module <<'JS'
import pg from 'pg';
const db = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 1});
try {
  console.log(JSON.stringify({event:'runtime_inventory',node:process.version,
    gigachatEnabled:process.env.GIGACHAT_ENABLED==='true',
    authConfigured:!!(process.env.GIGACHAT_AUTH_KEY || process.env.GIGACHAT_AUTH_KEY_FILE),
    caConfigured:!!process.env.GIGACHAT_CA_BUNDLE}));
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const {rows} = await db.query(`SELECT e.slug,e.created_at,
    (SELECT count(*)::int FROM submissions s WHERE s.event_id=e.id) submissions,
    (SELECT count(*)::int FROM submissions s WHERE s.event_id=e.id AND s.approved) approved,
    (SELECT count(*)::int FROM questions q WHERE q.event_id=e.id) questions,
    (SELECT count(*)::int FROM semantic_queue sq JOIN questions q ON q.id=sq.question_id WHERE q.event_id=e.id AND sq.status='pending') pending
    FROM events e WHERE e.rehearsal AND e.slug ~ '^(semantic-acceptance|acceptance)-[a-f0-9-]{36}$'
    AND e.created_at > now()-interval '6 hours' ORDER BY e.created_at DESC LIMIT 4`);
  await db.query('COMMIT');
  console.log(JSON.stringify({event:'synthetic_acceptance_inventory',tests:rows}));
} catch {
  console.error('READ_ONLY_INVENTORY_FAILED');
  process.exitCode=1;
} finally { await db.end(); }
JS
printf 'READ_ONLY_SNAPSHOT_COMPLETE\n'
