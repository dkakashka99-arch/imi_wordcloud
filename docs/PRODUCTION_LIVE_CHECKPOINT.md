# Production checkpoint — 2026-10-25 11:42 UTC

Scope: imi_wordcloud only. Repository dkakashka99-arch/imi_wordcloud (devwork connection). IMI One untouched.

## Confirmed
- Stage 4 preserved: 12 unit, 24 integration, 8 browser tests. main 1feaae51ffde5c43a612ffa5433ce0d7bbee7e29 passed CI 40187560565 and Infrastructure 40187560598; Docker, synthetic 300 participants, restart and encrypted backup restoration passed Infrastructure.
- VPS 212.109.196.228 Ubuntu 24.04.5, 2 CPU, 3812MB RAM, 1905MB swap. Docker29/Compose5, PostgreSQL17 image, Nginx/Certbot/restic installed. Firewall22/80/443. Deploy SSH restricted key, database has no public port.
- Repository DEPLOY_SSH_KEY verified by actual SSH. It contains bare OpenSSH payload; ops/normalize-ssh-key.py V2 reconstructs formatting and checks magic without printing contents.
- Host public key pinned against independently authenticated fingerprint. Never use ssh-keyscan trust-on-first-use.
- Apex and www A point to server, NS FirstVDS, no AAAA. Domain active. DNS not changed.
- HTTPS certificate issued, Nginx active, certbot.timer active; renewal dry-run PASS in run40187401932. CA bundle for GigaChat installed; credentials server-only under shared, not in git/build.
- Direct VPS docker pull postgres:17-bookworm succeeded in run40189515213. Large SSH image transfer ~60KB/s was cancelled to avoid duplicate upload; source archive only207488 bytes delivered successfully.
- PR8/9 merged develop fc3cced292626b699849cf347773f25e11e6e56f with green CI/Infrastructure. PR10 develop→main open, held until initial rollout and delivery improvement ready.
- PR11 fix/vps-source-delivery d96ada4a421e627828a16a62f673e77e69b831c8 changes production delivery to exact source SHA/build on VPS; preserves optional runner build and all gates. Local YAML/bash syntax PASS; CI pending.

## In progress (do not duplicate)
- First source rollout: https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40189618614. SSH source/checksum delivered, Docker production build on VPS in progress. Stage afterward: migrations, readiness, real GigaChat synthetic smoke, paused 27Oct event seed and teacher account.
- Public acceptance auto waits for ready AND organizer password: latest commit b2bbc980072a5486b567e52cd0e9116583fa15ed on ops/initial-vps-access. Tests300 synthetic public submissions in isolated temporary event, DB/cloud totals, auth/CSRF/QR; cleans only test event.
- Earlier large-image runs40187563211/40188464407 cancelled; old acceptance failures were waiting for unready app, not test regressions.
- Resource probe40189735066: ~937MB RAM used, no swap,53GB free, Next production build active; HTTPS502 at11:39 before app started.

## Next
Read current rollout/acceptance results. Fix actual failures; do not expose organizer-password. After verified initial release, merge PR11 after head checks and promote PR10 with expected head; then main checks trigger production backup/deploy. Confirm real encrypted offsite artifact and restore, final public acceptance, persistence and current SHA.

Backups: backup.yml (develop) schedules daily encrypted GitHub Artifact14days; password derived from original normalized high entropy SSH private key, never uploaded. Actual pg_dump is restored on isolated PG17 before artifact upload. Preserve original key for restoring old backups after key rotation. Artifact failure blocks update. External SFTP/S3 alternative documented; no paid target provisioned.

## Pending acceptance
Public app/AI/seed/admin not yet confirmed. VPS reboot and Russian mobile ISP without VPN not checked. Owner can retrieve generated organizer password in own SSH session; do not put it in Actions output. Root password rotation/hardening only after verified permanent access and owner recovery arrangement (VMmanager unavailable). No new services purchased.
