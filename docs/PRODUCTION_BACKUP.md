# Production backup on GitHub Actions

Default first production destination: encrypted Actions artifacts in this same GitHub repository, no new paid service. Scheduled daily at 03:15 Europe/Samara (23:15 UTC) and before automated deployments. Retention: 14 days. Artifacts contain only a restic-encrypted repository; no plaintext dump, SSH private key, or encryption password. Upload failure/quota exhaustion blocks deployment; do not purchase storage automatically.

Each backup runs pg_dump, encrypts using restic, verifies integrity, decrypts and compares dump bytes, then pg_restore into a network-isolated temporary PostgreSQL container. Only counts are printed. Upload must succeed before the deployment records an artifact URL proof for that exact SHA. Manual deployments without a configured external restic destination or this proof fail before migrations/replacing a running release.

Encryption recovery key is derived with SHA-256 and a purpose prefix from the canonical OpenSSH deploy private-key file. Preserve a secure independent copy of that key. Before rotating DEPLOY_SSH_KEY, retain the old key until its last backup expires, or decrypt/re-encrypt old backups under a separate long-term recovery key. Losing both the original key and GitHub secret prevents recovery. Do not put the key in artifacts or logs.

Recovery: download an encrypted-postgres artifact from a successful Encrypted PostgreSQL backup / Production run, unpack encrypted-backup.tar.gz, normalize the saved original deploy private key with ops/normalize-ssh-key.py, and derive the restic password locally:

```python
from pathlib import Path
import hashlib
Path("restic-password").write_text(hashlib.sha256(b"imi-wordcloud-restic-v1\0"+Path("normalized-deploy-key").read_bytes()).hexdigest())
Path("restic-password").chmod(0o600)
```

Then use restic with RESTIC_PASSWORD_FILE pointing to that file and repository path repo, run restic check, and restic dump latest /postgres.dump > database.dump. Restore only into a NEW isolated PostgreSQL 17 instance using pg_restore --exit-on-error --no-owner, verify counts, questions and exports; preserve live volume. Production replacement is a planned maintenance action. Never automatically restore old data during app rollback.

The earlier SFTP/S3 restic scripts remain an alternative if an existing free external target is configured. Their systemd timer is not the active default until configured. Check Actions backup success and retention weekly, and save an extra backup after the event. This artifact destination has no immutability guarantee against repository administrators and depends on GitHub availability; restore-test and download a copy before the event.
