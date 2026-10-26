#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root in the VPS console'; exit 1; }
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo 'Ubuntu 24.04 required'; exit 1; }
[[ $(dpkg --print-architecture) == amd64 ]] || { echo 'This bootstrap targets amd64'; exit 1; }
# Arguments are PUBLIC keys, never private keys. Keep the console open throughout.
[[ $# == 2 ]] || { echo 'Usage: bash ops/bootstrap.sh ADMIN_PUBLIC_KEY_FILE CI_PUBLIC_KEY_FILE'; exit 1; }
ssh-keygen -lf "$1" >/dev/null
ssh-keygen -lf "$2" >/dev/null
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg openssh-server ufw nginx certbot restic jq
install -m 0755 -d /etc/apt/keyrings
curl --fail --show-error --silent --proto '=https' https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
printf '%s\n' 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable' > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker nginx ssh
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
# Docker membership is root-equivalent. This is a dedicated trusted deployment account.
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cat "$1" > /home/deploy/.ssh/authorized_keys
printf 'restrict ' >> /home/deploy/.ssh/authorized_keys
cat "$2" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
install -d -m 750 -o deploy -g deploy /opt/imi-wordcloud /opt/imi-wordcloud/releases /opt/imi-wordcloud/incoming
install -d -m 700 -o deploy -g deploy /opt/imi-wordcloud/shared /opt/imi-wordcloud/shared/certs
# Do NOT disable root/password access until a second SSH session succeeds.
cat > /etc/ssh/sshd_config.d/40-imi-deploy.conf <<'EOF'
Match User deploy
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PubkeyAuthentication yes
    AllowTcpForwarding no
    X11Forwarding no
Match all
EOF
sshd -t
systemctl reload ssh
ssh_port=$(sshd -T | awk '$1=="port" && !seen++ {print $2}')
ufw allow "${ssh_port}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
# Docker only publishes app on loopback; database has no published port.
install -d /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\n' > /etc/systemd/journald.conf.d/imi.conf
systemctl restart systemd-journald
cat <<'EOF'
Bootstrap complete. Test deploy SSH in a separate terminal before hardening root login.
Next: shared env files, backup target, release upload, deploy, DNS, HTTPS.
No application or paid service has been provisioned by this script.
EOF
