# Stage 5 infrastructure preparation — 24 October 2026

Live develop baseline: 6b7336b34a7c668eef4df5535ece68f863bdafbc (stage 4 + CI fix).
Main: 6a04777d8e2c073d53541e2ce318b3859ca47766. Main is not advanced here.

Ready: Node 24 / Next.js standalone; pg Pool + tracked Drizzle migrations; transactional idempotent answers, audience isolation; hashed admin sessions/scrypt, server API authorization, Origin/JSON CSRF checks, bounded validation, SQL parameters, escaped React text, QR/exports/archive and organizer-approved AI. All active organizers have college-wide access to all events by existing design, not isolated tenant accounts.

Entrypoints: .next/standalone/server.js, src/app/api/**, scripts/migrate.ts, create-admin.ts, seed.ts. No Vercel-specific runtime, CDN, Blob, KV, Edge or cron dependency. No browser font/CDN dependency. Build needs npm/GitHub/container registries; optional runtime AI needs GigaChat; certificates and backups require their providers.

Environment: DATABASE_URL, APP_ORIGIN, DB_POOL_MAX; GIGACHAT_ENABLED, GIGACHAT_AUTH_KEY or GIGACHAT_AUTH_KEY_FILE, GIGACHAT_SCOPE, GIGACHAT_MODEL, GIGACHAT_TIMEOUT_MS, GIGACHAT_MAX_INPUT_WORDS, GIGACHAT_CA_BUNDLE; standard Node server/telemetry variables. No secrets required in build. See ops/app.env.example.

Added: Docker runtime/tools, compose persistence/private DB/limits/health/restarts/log rotation, Nginx + Certbot, Ubuntu bootstrap, SHA release SSH delivery with local/public health gates and rollback, encrypted off-host restic/timers and isolated restore, 300 simultaneous HTTP participant CI with restart and dump/restore verification, reusable paused JSON event import, full owner/admin runbook.

Local evidence: dependency install, lint, TypeScript, 12/12 unit tests and optimized production build passed. Shell/YAML syntax checked separately. No Docker daemon locally: Infrastructure CI must provide real image/compose/load/restart/restore evidence. Existing 24 integration/8 browser tests remain in CI. Existing stage-4 live GigaChat results preserved; production live calls pending. Runner load results do not establish VPS/network capacity.

Mandatory before publishing: actual VPS/SSH test and bootstrap; branch protections + main-only production environment; domain registration/DNS A record and no stale AAAA; HTTPS/renewal; host secrets/verified CA and GigaChat college-use terms; chosen existing free off-VPS destination and verified external restore; public smoke, rollback, reboot, mobile QR/projector and Russian no-VPN checks.

No VPS access, deployment, DNS edit, purchase or IMI One changes performed. See PRODUCTION.md for precise initial actions and pending checks.
