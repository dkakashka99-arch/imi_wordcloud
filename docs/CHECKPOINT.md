# Checkpoint — production deployed, 25 October 2026

imi_wordcloud only, repository dkakashka99-arch/imi_wordcloud (devwork). Do not touch IMI One.
Live release84ff46af7e25b88277cd05a1f8f2e4ee0042cb06. Main CI40190336171+Infrastructure40190336160 PASS. PR5/6/7/8/9/10/11merged; architecture and stage4 preserved.

Actual Production40190469864+40190660467 PASS: pinned SSH deployment, backup+isolated restore, safe migrations, public HTTPS. Actual reboot40190469406 PASS (boot_id changed, Docker/DB/app/SSH/HTTPS recovered, one saved synthetic answer retained then removed). Public300load40189807615 PASS. Real VPS GigaChat all3functions40190027945 PASS, strict TLS/normalizedCA. Live organizer API workflows40195804173 PASS including moderation/aliases/export/archive/copy/auth. All disposable data cleaned.

VPS212.109.196.228 Ubuntu24.04.5, Docker29/Compose5/Nginx/Certbot/restic, 2CPU/3812MBRAM/1905MBswap. DNSapex+www Acorrect, FirstVDSNS, noAAAA. Apex HTTPSissued, renewal dryrun passed. No VMmanager/DNSmanager currently; SSH works. Permanent DEPLOY_SSH_KEY format normalized safely; no replacement necessary. Never output credentials.

Main production workflow defaults source archive/build on VPS after measured slow image transfers; optional DEPLOY_BUILD_ON_VPS=false. PRODUCTION_ENABLED=falsepauses it. Daily encrypted offsite GitHubArtifactbackup14days at03:15Samara, actualrestored before upload. Preserve original normalized deploykey for decrypting old backups after rotation. See PRODUCTION.md,PRODUCTION_BACKUP.md,PRODUCTION_ACCEPTANCE.md.

Created eventmir-27-oct with requested independent student/employer questions, paused. Teacherlogin exists; generated password serverfile shared/organizer-password600, owner retrieves in own SSHsession. Do not put it in chat/logs.

Remaining owner tasks: Russian noVPNphysicalnetworks/phoneQR/projector, owncredentialretrieval, personalSSHrecovery and rootpasswordrotation (VMconsole unavailable so recovery notdisabled), GitHubbranch/environmentprotection settings (connector can'tadminister). No paidstorage/panels purchased.
Next task: finish delivery of documentation PR to develop/main after requiredchecks; read current PR/run status first and do not duplicate deployed application or rerun load/AI/reboot without a new reason.
