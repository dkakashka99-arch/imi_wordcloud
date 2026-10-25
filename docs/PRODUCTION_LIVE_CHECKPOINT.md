# Final production checkpoint — 25 October 2026, 17:30 Samara

imi_wordcloud only. IMI One untouched. Repository dkakashka99-arch/imi_wordcloud, devwork connection.

## Finished and verified
- Current main and actual VPS release: 7d20b913ffa348586261fcbfb79240253089107b.
- PR12 docs→develop and PR13 develop→main merged after exact-head checks. Final main CI40197036573 and Infrastructure40197036570 SUCCESS.
- Final automatic production runs40197185894 and40197407247 SUCCESS. Latest verified encrypted backup: https://github.com/dkakashka99-arch/imi_wordcloud/actions/runs/40197407247/artifacts/12600128982 .
- Final production acceptance40197796183 SUCCESS: exact current SHA, app+db healthy, actual real-event questions paused, real answers0 and rehearsal events0, teacher active, app.env/compose.env600, organizer-password exists, public HTTPSready, both participant routes and real QR endpoints200, HTTP→HTTPS, .env404, adminAPI401.
- Public exposure22/80/443 only; app127.0.0.1:3000; no publishedPostgreSQL. Secret-file checks were rerun with psql stdin isolated, so following shell checks actually executed.
- Earlier public300participant load40189807615 PASS (300DB/cloud, p95≈4.1s); live organizer workflows40195804173 PASS (CRUD,start/pause,moderation approval,alias/export/archive/copy/auth). Disposable fixtures/admin removed.
- Real GigaChat VPS40190027945 PASS: OAuth/models/GigaChat-2,aliases/moderation/summary, TLSverified. CA normalized through openssl x509; no verification bypass.
- Full actual VPS reboot40190469406 PASS: changedboot_id, SSH/HTTPS/app/db restored automatically; synthetic saved answer survived prior rollout+reboot then removed.
- TLSrenewaldryrun40187401932 PASS; certbot.timer active. Apex certificateexpires23Jan2027.
- Eventmir-27-oct exists with requested independent student/employer questions paused and clean. Teacherlogin exists; password remains server-only shared/organizer-password600.
- Current application code is identical to baseline84ff46af release in the main acceptance report;7d20b913 adds documentation only.
- Documentation: main/docs/PRODUCTION.md,PRODUCTION_ACCEPTANCE.md,PRODUCTION_BACKUP.md,DEPLOYMENT_TRANSPORT.md. Main checkpoint documents tested baseline; this operational checkpoint records final delivered SHA.

## Operational facts
VPS212.109.196.228 Ubuntu24.04.5,2CPU/4GB/60GB; Docker29/Compose5/Nginx/Certbot/restic,firewall. DNSapex+www A point correctly, FirstVDSNS,noAAAA. No DNS changes or paid services added. Only canonical apex HTTPS configured; www certificate not issued.
DEPLOY_SSH_KEY actually works after safe formatting normalization; do not ask owner to replace it. Host key pinned against authenticated fingerprint. Main deploy defaults compact exact-SHA git archive + DockerbuildonVPS (large image SSHtransfer was slow). Optional DEPLOY_BUILD_ON_VPS=false; PRODUCTION_ENABLED=falsepauses deploy. Only trustedmainchecks deploy; publicPRjobs have no productionsecrets and never run on VPS.
Daily encrypted offsite GitHubArtifacts backup at03:15Samara,retention14days, actual isolated restoration before upload. Preserve original normalizeddeploy privatekey separately to decrypt old backups after rotation. Original key is not in artifacts.
All automated work is complete. Do not rerun bootstrap, create another organizer, reseed/overwrite event, repeat load/AI/reboot or redeploy old SHA without a new reason.

## Owner acceptance / access actions remaining
1. Open https://imi-cloudpoll.ru from Russian mobile/WiFi withoutVPN; physically scanQRs/checkprojector. Agent browser/GitHub/MoscowVPS do not prove residentialISP connectivity.
2. Retrieve teacherpassword in own trustedSSH session: cat /opt/imi-wordcloud/shared/organizer-password . Keepoutofchat/logs. Verify personalSSHkey and save originalCIkey for backuprecovery; rotate originalrootpassword interactively. VMmanager is unavailable, so root/password recovery was notdisabled. Afterrotation delete stale VPS_BOOTSTRAP_PASSWORD from GitHubSettings.
3. GitHub main/develop are currently unprotected (verified API), no rulesets. Owner must enable required CI+Infrastructure and main-only production environment policy in Settings; connector lacks administrationtools. Workflow-level main/CI/secret guards already enabled.
4. Check scheduledbackupsuccess and run a manual backup afterevent. No paid storage was bought.
