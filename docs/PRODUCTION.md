# imi_wordcloud: FirstVDS production runbook

Status: infrastructure preparation. No VPS access or real deployment has occurred.
Server: Ubuntu 24.04 amd64, 212.109.196.228, 2 CPU / 4 GiB / 60 GiB.
Domain: https://imi-cloudpoll.ru. IMI One is outside scope.

## Initial actions required from the owner

1. Open FirstVDS yourself; verify server 18650201 is running and domain registration is completed (a saved order alone is insufficient). Keep its recovery/web console available.
2. Provide an authenticated browser session if this environment supports it. Browser automation is available here, but access to your FirstVDS session and its console is NOT yet verified. A browser console is not an SSH tunnel; terminal access must be tested separately. No passwords/private keys/API tokens in chat.
3. Alternative: download this reviewed repository release onto your own computer or VPS console. Generate two Ed25519 key pairs locally: one personal administrator key, one CI deployment key. Keep private keys private; only copy `.pub` files to VPS, e.g. `/root/admin.pub` and `/root/ci.pub`.
4. In VPS root console, in the reviewed checkout, run `bash ops/bootstrap.sh /root/admin.pub /root/ci.pub`. Read the script first. It installs Docker from Docker's signed official apt repository, Nginx, Certbot, restic, firewall and deploy user. It does not buy anything. It preserves root access to avoid lockout. Test a second SSH session as deploy before disabling root/password login. Confirm architecture with `dpkg --print-architecture` (script targets amd64).
5. Set GitHub environment `production` with deployment branch policy **main only**, required reviewer if available, and disable bypass if available. Restrict who can push main/develop and require both `CI / checks` and `Infrastructure / containers`. Repository protection is not currently enabled; this must be configured in GitHub settings before production automation is enabled.
6. Put CI **private** key directly in GitHub environment secret `DEPLOY_SSH_KEY`. Put the server host key in `DEPLOY_KNOWN_HOSTS`: get `/etc/ssh/ssh_host_ed25519_key.pub` using the trusted VPS console, compare fingerprint with `ssh-keygen -lf`, and format `212.109.196.228 ssh-ed25519 ...`. Do not trust an unauthenticated ssh-keyscan alone. For nondefault SSH port use `[212.109.196.228]:PORT`.
7. Set GitHub variables `DEPLOY_HOST=212.109.196.228`, `DEPLOY_PORT=22`. Leave `PRODUCTION_ENABLED` unset until the initial manual deployment, HTTPS and backup verification succeed.
8. Choose an already available free off-VPS backup destination (SFTP machine / existing S3-compatible storage). Supply its credentials only on the VPS in `shared/backup.env`, not chat. If none exists, off-site backup is still blocked; do not call production ready or buy storage automatically.

### Prepare secrets on VPS

As deploy, from reviewed checkout:

```bash
umask 077
cd /opt/imi-wordcloud
openssl rand -hex 32 > shared/db-password
printf 'POSTGRES_PASSWORD=%s\n' "$(cat shared/db-password)" > shared/compose.env
cp /path/to/reviewed-checkout/ops/app.env.example shared/app.env
nano shared/app.env
chmod 600 shared/compose.env shared/app.env shared/db-password
```

Replace DATABASE_URL password with the same generated hex password. Keep `GIGACHAT_ENABLED=false` until credentials, CA and usage terms are verified. Do not regenerate DB password after initialization without changing the PostgreSQL role password too. `.env` files are not shell scripts except backup.env; avoid shell expansion and use hex DB password.

Deploy is a trusted machine account: Docker-group membership is **root-equivalent**. It is not an unprivileged tenant account. No sudo permission is granted. CI key has `restrict`; password login and forwarding are disabled for deploy. Anyone allowed to change main/workflows can ultimately control this dedicated server. Never run external PR jobs on this host.

## DNS without ISPmanager

Official FirstVDS docs checked 24 October 2026:

- https://firstvds.ru/services/dns-hosting
- https://firstvds.ru/technology/sozdanie-domennykh-dns-zapisey-s-pomoschyu-dnsmanager
- https://firstvds.ru/technology/znakomstvo-s-panelyami-upravleniya

Active VPS includes DNS hosting for up to 10 domains. Login is normally Products → Virtual servers → server → Instruction → DNSmanager → Go. It does not require purchasing ISPmanager. Since this account lacks the block, request **activation/access to included DNS hosting** from support; do not assume it is a paid panel.

Suggested support request: “Активен VDS 18650201, без ispmanager. В инструкции отсутствует блок DNSmanager. Прошу предоставить доступ к включённому бесплатному DNS-хостингу для imi-cloudpoll.ru на ns1.firstvds.ru/ns2.firstvds.ru. Нужна A-запись 212.109.196.228. Платные услуги не подключать.” The owner sends this; no support message has been sent automatically.

Set apex (`@` / `imi-cloudpoll.ru.`) A → `212.109.196.228`, TTL 300–600. Do not add AAAA until working IPv6 is configured. Optional www CNAME → apex is not required and not included in certificate. Verify authoritative answers and independent recursive resolvers, registration/delegation, and remove contradictory parking A/AAAA. DNS creation cannot complete an unpaid/unregistered domain.

Fallback: delegate to another DNS host with an explicitly free plan and no proxy/CDN, then create the same A record there. Do not operate a single authoritative DNS instance on this VPS. Provider/NS change needs an account and verification; keep FirstVDS DNS as first choice. No alternative account has been created or purchased.

## HTTPS and reverse proxy

Nginx chosen for built-in request/connection limits without third-party modules. Certbot uses webroot HTTP-01; systemd timer renews and validated deploy hook reloads Nginx. API buffering is disabled; 90s upstream timeout covers bounded AI operations. Current cloud uses HTTP polling, not platform events. Rate limits permit college NAT bursts and must be tuned from rehearsal data. They do not provide upstream volumetric DDoS protection.

Once DNS resolves to this VPS and ports 80/443 are reachable, as root in the reviewed checkout:

```bash
bash ops/enable-https.sh YOUR_REAL_EMAIL
nginx -t
systemctl status certbot.timer
curl --fail https://imi-cloudpoll.ru/api/ready
```

Do not run until a healthy app exists. The script temporarily serves HTTP 503 except ACME. It does not disable TLS checks. It is intended for first certificate setup, not routine deployment. Nginx default site may remain but does not match the chosen hostname. Certbot dry-run tests renewal. Check external access through Russian mobile/Wi-Fi without VPN after setup; this has not been tested yet.

## Build, release, migrations, rollback

`Dockerfile` runtime is standalone Next.js, UID node. Separate tools target has migration/admin/import scripts, no build secrets. Runtime has no tsx/dev dependencies. Build images on GitHub, not 4 GiB VPS. Resource limits: app 1536 MiB / 1.25 CPU, DB 1 GiB / .75 CPU, temporary tools 512 MiB. Leave memory for OS and Nginx. PostgreSQL 17 uses named volume `imi-wordcloud-postgres`, no published port; app binds 127.0.0.1 only. `unless-stopped` + enabled Docker restores running services after reboot.

PR → develop runs existing lint/types/unit/integration/build/HTTP/browser checks plus Infrastructure container checks. develop → main via PR. Production listens only to successful push checks on main and waits for **both** workflows on the same SHA. No pull_request_target, no production secrets on PR. Images are transferred over pinned SSH rather than requiring VPS access to GHCR. SHA256 verifies transfer integrity; SSH authenticates the source. Main head is checked before upload. Serial deployments; no cancellation midway.

First deployment: build both image targets tagged with the reviewed main SHA and upload using the same steps as production.yml (or temporarily enable workflow after HTTPS/backup prerequisites are prepared). `release.tar.gz` contains compose and ops; images contain code and migrations. Extract into `/opt/imi-wordcloud/releases/SHA`, `docker load`, then `bash ops/deploy.sh SHA`. HTTPS script runs once after first healthy app. Set `PRODUCTION_ENABLED=true` after public validation and a verified external backup. Subsequent main updates deploy automatically.

Before later deployments: `ops/backup.sh` must succeed; then migrations run once under host deployment flock. Migrations must be **expand-only/backward compatible** with the previous release; never use schema push in production. Review every schema change. Failed migration leaves old app running. Failed new app healthcheck brings back previous image. Never downgrade DB automatically, delete volume, or restore a backup over live data as automatic rollback. A destructive migration requires a separate maintenance/recovery plan.

Public HTTPS smoke failure invokes `ops/rollback.sh` only if that exact run promoted the current SHA. Manual rollback: `bash /opt/imi-wordcloud/current/ops/rollback.sh`. Local readiness means a DB query succeeds; public smoke additionally covers Nginx/TLS/DNS. There is brief single-container replacement downtime; no zero-downtime claim.

If GitHub-hosted SSH cannot reach Russia: use a **dedicated outbound-only self-hosted runner on a separate trusted machine**, labeled `imi-production`, and `DEPLOY_RUNNER=imi-production`. It must have Docker, git, gh, jq, SSH, gzip, enough build RAM, access to GitHub and VPS SSH. Register through GitHub's current runner installation UI, constrain runner group/repository and production/main use. Never run public PR builds there. Do not install a general PR runner on this production VPS. Outbound connectivity must be tested; no runner is installed now.

## GigaChat

Keep existing consent/manual apply workflow. Requests are organizer-triggered, bounded and rate/budget limited by AI jobs, not participant submissions. Tokens are cached with single-flight renewal; only OAuth/401 retry, no ambiguous chat generation retry. 20s timeout, validated response schema, safe error messages, fixed remote hosts and TLS verification are preserved. AI outage does not enter participant submit/cloud path.

Store key directly in `shared/app.env` mode 600 (`GIGACHAT_AUTH_KEY`) or extend compose with a read-only secret file and existing `GIGACHAT_AUTH_KEY_FILE`. Never pass it as build-arg or NEXT_PUBLIC variable. Obtain current Russian CA bundle from official Sber/Minцифры links documented in `docs/GIGACHAT.md`, verify fingerprint through the official channel, save `shared/certs/russian-trusted-ca.pem` readable by container UID 1000 (CA is public, directory 755/file 644). Only these HTTPS requests receive additional trust. Do not set NODE_TLS_REJECT_UNAUTHORIZED=0. Credentials stay on host; GitHub need only SSH deploy credentials.

Official terms https://developers.sber.ru/docs/ru/policies/gigachat-agreement/individuals §2.4 limit Freemium to **personal noncommercial use**. A free college event is not automatically personal use: confirm suitability with Sber/college before enabling public-event AI. No paid package ordered. Current free quotas are account/model-specific; check project quota/dashboard before rehearsal. Reference https://developers.sber.ru/docs/ru/gigachat/tariffs/individual-tariffs and https://developers.sber.ru/docs/ru/gigachat/tariffs/commercial. Do not promise a fixed historical quota. If unsuitable/exhausted, keep manual poll/moderation working with AI disabled pending an approved solution.

## Backups and recovery

A volume is not a backup. Use restic encryption with a strong unique password saved separately from VPS (password manager). Configure `shared/backup.env` from example, mode 600. Pin SFTP host key through trusted channel or configure existing S3 credentials. Target must physically be outside this VPS and available at no new charge. Initialize only your dedicated repository:

```bash
set -a
source /opt/imi-wordcloud/shared/backup.env
set +a
restic init
bash /opt/imi-wordcloud/current/ops/backup.sh
bash /opt/imi-wordcloud/current/ops/restore-drill.sh
```

Install systemd service/timer as root from ops, `systemctl daemon-reload`, `systemctl enable --now imi-wordcloud-backup.timer`. Daily 03:00 Samara plus before updates. Retention 7 daily / 4 weekly / 3 monthly; tag-scoped pruning. `restic check` follows backups. Review `systemctl --failed` and `journalctl -u imi-wordcloud-backup.service`; failed copies must be investigated. RPO up to 24h normally: manually copy after the event and important sessions. RTO depends on external destination and dump size, to be measured during rehearsal.

Restore drill downloads latest tagged dump and restores into an isolated, networkless disposable PostgreSQL container; production untouched. Compare row counts, important event questions/results and sample exports against backup-time records. CI additionally verifies exactly 300 restored submissions. External transfer/encryption/key recovery must be verified on chosen destination before claiming backups complete.

Disaster recovery: provision clean host with same PostgreSQL major version, retrieve secrets separately, download verified backup using restic, restore into a **new empty DB/volume** with `pg_restore --exit-on-error --no-owner`, apply reviewed migrations if needed, validate counts/exports/organizer login, then switch app DB. Stop writes during planned live restore, preserve original volume, take a final backup. Do not overwrite production DB using the drill or use `down -v` on production.

## Disk and routine administration

Docker JSON logs rotate at 10 MiB ×3 per service, journald capped at 200 MiB, packaged Nginx logrotate rotates errors. Access logs disabled to avoid leaking queries/identifiers. Check daily and before uploads: `df -h / /opt/imi-wordcloud`, `docker system df`, `systemctl --failed`, backup age, certificate expiry. Keep at least 8 GiB free before release upload; investigate at 80% disk use. No unbounded local pg_dump files. Release tarballs removed only after successful deployment; failed uploads need manual cleanup after investigation.

Retain current and previous images/releases. Remove only explicitly identified old imi-wordcloud tags/directories after confirming current/previous SHAs and backup success. Never use `docker system prune --volumes`, volume prune or compose down -v. Check PostgreSQL growth and expired session/login-limit tables before longer-term operation; ongoing retention automation is a follow-up if growth is material. OS updates/reboots are scheduled outside events; verify Docker, readiness, HTTPS and saved results after reboot.

## Prepare 27 October

Data file `ops/event-27-oct.json` contains exact two requested questions. Once admin exists and DB is healthy, run in current release as deploy:

```bash
export RELEASE=$(cat /opt/imi-wordcloud/shared/current-release)
docker compose --env-file /opt/imi-wordcloud/shared/compose.env -f compose.production.yaml run --rm -T tools npm run db:seed -- ops/event-27-oct.json
```

Idempotent import never modifies an existing event. Both independent audience/questions start paused, no demo answers. Existing event with same slug must be reviewed in panel rather than silently overwritten. Login at `/admin`, review questions/limits, QR links `/e/mir-27-oct/student`, `/e/mir-27-oct/employer`, projector `/e/mir-27-oct/screen`. Start each question explicitly. Employers around 10, students rehearsed with 300 virtual participants on isolated data.

Create first admin using existing CLI with password on stdin, not argv/history:

```bash
read -rs -p 'New organizer password: ' admin_password
printf '%s' "$admin_password" | docker compose --env-file /opt/imi-wordcloud/shared/compose.env -f compose.production.yaml run --rm -T tools npm run admin:create -- teacher
unset admin_password
```

All active organizers are trusted college-wide administrators and see all events (current intentional model), not isolated user tenants. Students have no admin credentials. Panel already supports arbitrary events/questions, audience QR, start/pause/close, archive, moderation, aliases, statistics, exports and reviewed AI summaries. No UI redesign in this step.

## Evidence and outstanding checks

See STEP_05_REPORT.md and CHECKPOINT.md. Container tests run only against unique CI volume and empty DB; 300 concurrent HTTP submissions, cloud totals, restart persistence, pg_dump/restore. Existing 12 unit / 24 integration / 8 browser baseline retained, not replaced. Real GigaChat smoke stays an explicitly dispatched trusted workflow with its own credentials; mocks do not prove production connectivity.

Pending until access: bootstrap execution, SSH/network route, actual registration/authoritative DNS, HTTPS issuance/renewal, off-site destination and restore, host reboot persistence, all three live AI functions, mobile QR scan/projector, all organizer functions and Russian no-VPN access. Do not declare the 26 October completion criterion achieved until all are recorded.
