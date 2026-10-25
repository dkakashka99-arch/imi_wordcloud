# imi_wordcloud: FirstVDS production runbook

Status: deployed on 25 October 2026. Main release `84ff46af7e25b88277cd05a1f8f2e4ee0042cb06` passed CI, automatic production deployment, actual VPS reboot and persisted-answer checks. See [PRODUCTION_ACCEPTANCE.md](PRODUCTION_ACCEPTANCE.md) for evidence and remaining owner checks.
Server: Ubuntu 24.04 amd64, 212.109.196.228, 2 CPU / 4 GiB / 60 GiB.
Domain: https://imi-cloudpoll.ru. IMI One is outside scope.

## Current access and owner actions

The existing server is already bootstrapped. Do not repeat bootstrap, recreate the database volume or regenerate its password. VMmanager/DNSmanager is temporarily unavailable; SSH works and DNS was configured by FirstVDS support without paid services.

- Organizer: https://imi-cloudpoll.ru/admin, login `teacher`. In your own trusted SSH session as root, retrieve `cat /opt/imi-wordcloud/shared/organizer-password` and save it in your password manager. Do not send it to chat, support or Actions logs.
- Add and verify your own administrator public SSH key before disabling any recovery login. Rotate the original root password interactively with `passwd` in your own SSH client; the agent has not disabled root/password recovery while VMmanager is unavailable.
- GitHub repository secret `DEPLOY_SSH_KEY` is working. The normalizer validates/reconstructs OpenSSH formatting without printing the key. Host identity is pinned; do not replace this with unauthenticated ssh-keyscan.
- Owner GitHub settings still need verification: restrict pushes/require CI and Infrastructure on main/develop, and restrict environment `production` to main. The connected GitHub app cannot administer these settings. Workflows themselves accept production only from exact successful main push checks and never expose production secrets to PR jobs.
- Open the public site from Russian mobile/Wi-Fi with VPN disabled; scan both QR codes and test the projector. Automated checks from GitHub and the Moscow VPS do not establish access through every Russian ISP.

For a **replacement empty Ubuntu 24.04 amd64 host only**, review `ops/bootstrap.sh`, supply separate personal and CI public keys and run it from a trusted root console. It installs Docker from its signed official apt repository, Nginx, Certbot, restic, firewall and deploy account. Test another SSH session before restricting recovery access. Private keys/tokens/passwords are never sent in chat. Existing production data/secrets must be restored separately.

### Prepare secrets on VPS

For a new empty host only, as deploy from the reviewed checkout (these files already exist on production):

```bash
umask 077
cd /opt/imi-wordcloud
test ! -e shared/db-password || { echo 'Existing database password: stop and reuse it'; exit 1; }
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

Already verified on 25 October: apex and www A → `212.109.196.228`, NS `ns1.firstvds.ru` / `ns2.firstvds.ru`, no AAAA. No further DNS change is needed. For a replacement zone, set apex (`@` / `imi-cloudpoll.ru.`) A → `212.109.196.228`, TTL 300–600. Do not add AAAA until working IPv6 is configured. www DNS exists; the configured HTTPS certificate and canonical address cover the apex only. Use https://imi-cloudpoll.ru, not www. Verify authoritative answers and independent recursive resolvers, registration/delegation, and remove contradictory parking A/AAAA. DNS creation cannot complete an unpaid/unregistered domain.

Fallback: Cloudflare Free authoritative DNS (https://developers.cloudflare.com/dns/faq/) with the A record in DNS-only mode, proxy disabled. Create a free zone, replace registrar NS with the two assigned by Cloudflare, create apex A → 212.109.196.228, verify delegation. Do not enable its proxy/CDN. This introduces an overseas authoritative DNS dependency; FirstVDS is preferred. Do not operate a single authoritative DNS instance on this VPS. Provider/NS change needs an account and verification; keep FirstVDS DNS as first choice. No alternative account has been created or purchased.

## HTTPS and reverse proxy

Nginx chosen for built-in request/connection limits without third-party modules. Certbot uses webroot HTTP-01; systemd timer renews and validated deploy hook reloads Nginx. API buffering is disabled; 90s upstream timeout covers bounded AI operations. Current cloud uses HTTP polling, not platform events. Rate limits permit college NAT bursts and must be tuned from rehearsal data. They do not provide upstream volumetric DDoS protection.

Once DNS resolves to this VPS and ports 80/443 are reachable, as root in the reviewed checkout:

```bash
bash ops/enable-https.sh YOUR_REAL_EMAIL
nginx -t
systemctl status certbot.timer
curl --fail https://imi-cloudpoll.ru/api/ready
```

Do not run until a healthy app exists. The script temporarily serves HTTP 503 except ACME. It does not disable TLS checks. It is intended for first certificate setup, not routine deployment. Nginx default site may remain but does not match the chosen hostname. Certbot dry-run tests renewal. Check external access through Russian mobile/Wi-Fi without VPN after setup; this Russian-ISP check remains for the owner.

## Build, release, migrations, rollback

`Dockerfile` runtime is standalone Next.js, UID node. Separate tools target has migration/admin/import scripts, no build secrets. Runtime has no tsx/dev dependencies. By default, Actions uploads a compact git archive of the exact tested SHA with SHA256SUMS and builds these same targets on the VPS. This was successfully exercised on the actual 4 GiB server after slow image transfers were measured. Secrets remain outside the build directory. Set `DEPLOY_BUILD_ON_VPS=false` to build/transfer images on the runner instead; see [DEPLOYMENT_TRANSPORT.md](DEPLOYMENT_TRANSPORT.md). Resource limits: app 1536 MiB / 1.25 CPU, DB 1 GiB / .75 CPU, temporary tools 512 MiB. Leave memory for OS and Nginx. PostgreSQL 17 uses named volume `imi-wordcloud-postgres`, no published port; app binds 127.0.0.1 only. `unless-stopped` + enabled Docker restores running services after reboot.

PR → develop runs existing lint/types/unit/integration/build/HTTP/browser checks plus Infrastructure container checks. develop → main via PR. Production listens only to successful push checks on main and waits for **both** workflows on the same SHA. No pull_request_target, no production secrets on PR. The source archive (or optional images) is transferred over pinned SSH; VPS can reach Docker Hub directly and needs no GHCR credentials. SHA256 verifies transfer integrity; SSH authenticates the source. Main head is checked before upload. Serial deployments; no cancellation midway.

Initial deployment is complete. Subsequent reviewed main updates deploy automatically after both checks pass. `PRODUCTION_ENABLED=false` pauses production automation; unset/true enables it. Do not rerun HTTPS/bootstrap for normal releases.

Before later deployments, the reusable Actions backup workflow must export, encrypt, restore/check and upload a valid off-VPS artifact. Its artifact URL is recorded for the exact release and checked by `ops/deploy.sh`. If an alternative `shared/backup.env` is configured, the deployment script also runs the legacy external-restic backup. Migrations then run once under a host deployment flock. Migrations must be **expand-only/backward compatible** with the previous release; never use schema push in production. Review every schema change. Failed migration leaves old app running. Failed new app healthcheck brings back previous image. Never downgrade DB automatically, delete volume, or restore a backup over live data as automatic rollback. A destructive migration requires a separate maintenance/recovery plan.

Public HTTPS smoke failure invokes `ops/rollback.sh` only if that exact run promoted the current SHA. Manual rollback: `bash /opt/imi-wordcloud/current/ops/rollback.sh`. Local readiness means a DB query succeeds; public smoke additionally covers Nginx/TLS/DNS. There is brief single-container replacement downtime; no zero-downtime claim.

If GitHub-hosted SSH cannot reach Russia: use a **dedicated outbound-only self-hosted runner on a separate trusted machine**, labeled `imi-production`, and `DEPLOY_RUNNER=imi-production`. It must have Docker, git, gh, jq, SSH, gzip, enough build RAM, access to GitHub and VPS SSH. Register through GitHub's current runner installation UI, constrain runner group/repository and production/main use. Never run public PR builds there. Do not install a general PR runner on this production VPS. Outbound connectivity must be tested; no runner is installed now.

## GigaChat

Keep existing consent/manual apply workflow. Requests are organizer-triggered, bounded and rate limited by AI jobs, not participant submissions. Tokens are cached with single-flight renewal; only OAuth/401 retry, no ambiguous chat generation retry. 20s timeout, validated response schema, safe error messages, fixed remote hosts and TLS verification are preserved. AI outage does not enter participant submit/cloud path.

Store key directly in `shared/app.env` mode 600 (`GIGACHAT_AUTH_KEY`) or extend compose with a read-only secret file and existing `GIGACHAT_AUTH_KEY_FILE`. Never pass it as build-arg or NEXT_PUBLIC variable. Obtain current Russian CA bundle from official Sber/Minцифры links documented in `docs/GIGACHAT.md`, verify fingerprint through the official channel, normalize **each** downloaded certificate with `openssl x509 -in certificate.pem -out normalized.pem` before concatenation (raw PEM files may lack a final newline), then save `shared/certs/russian-trusted-ca.pem` readable by container UID 1000 (CA is public, directory 755/file 644). Only these HTTPS requests receive additional trust. Do not set NODE_TLS_REJECT_UNAUTHORIZED=0. Credentials stay on host; GitHub need only SSH deploy credentials.

The owner confirmed personal portfolio/noncommercial use with GIGACHAT_API_PERS; AI was enabled and all three tasks passed real requests on this VPS. No paid package ordered. Terms reference: https://developers.sber.ru/docs/ru/policies/gigachat-agreement/individuals. Current free quotas are account/model-specific; check project quota/dashboard before rehearsal. Reference https://developers.sber.ru/docs/ru/gigachat/tariffs/individual-tariffs and https://developers.sber.ru/docs/ru/gigachat/tariffs/commercial. Do not promise a fixed historical quota. If unsuitable/exhausted, keep manual poll/moderation working with AI disabled pending an approved solution.

## Backups and recovery

A volume is not a backup. The active free off-VPS mechanism is `.github/workflows/backup.yml`: daily at 23:15 UTC (**03:15 Samara**), manually via Actions, and before production updates. It streams `pg_dump -Fc` to the runner, encrypts with restic, checks the repository, decrypts and compares bytes, actually restores into isolated networkless PostgreSQL17, then uploads only the encrypted repository as a GitHub Artifact retained **14 days**. Plaintext dump/temporary keys are removed from the runner. No additional paid service was purchased.

Recovery and encryption-key derivation are documented in [PRODUCTION_BACKUP.md](PRODUCTION_BACKUP.md). Keep the original normalized deployment private key in your password manager: it derives the backup password. Preserve old keys for old backups after rotation. The password/key/plaintext are never included in the artifact. Repository access alone is insufficient to decrypt it. GitHub quota or backup/restore failure blocks a production update; monitor failed Actions. This does not provide immutable protection against an owner deleting all artifacts.

Actual production backup and isolated restoration passed in runs40190209164,40190469864,40190660467. The latter updates included a synthetic saved answer; it survived deployment and actual reboot, then its fixture was removed.

An already available SFTP/S3 destination remains an optional alternative: configure `shared/backup.env` mode600, pin its host key/credentials, initialize the dedicated restic repository and test `ops/backup.sh` / `ops/restore-drill.sh`. Only then enable the supplied systemd backup timer. Do not enable that timer without a configured destination. Its alternative retention is7daily/4weekly/3monthly; the active Actions mechanism uses14days. No storage purchase is authorized.

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

See [PRODUCTION_ACCEPTANCE.md](PRODUCTION_ACCEPTANCE.md). CI preserves12unit/24integration/8browser tests plus lint, TypeScript, production build and container verification. Actual public production verified300/300 synthetic submissions, matching cloud totals, auth/CSRF/QR; actual GigaChat verified aliases/moderation/summary with TLS. Real encrypted offsite backup restoration and a full VPS reboot with saved-answer persistence passed. Temporary fixtures were deleted.

Remaining owner checks: Russian networks without VPN, physical phone QR scan/projector, safe organizer-password retrieval, personal SSH recovery/password rotation and GitHub branch/environment settings. No FirstVDS panel availability or physical-device test is claimed.
