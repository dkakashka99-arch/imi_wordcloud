#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 && $# == 1 ]] || { echo 'Usage (root): bash ops/enable-https.sh ACME_EMAIL'; exit 1; }
# Verify A/AAAA and domain registration before running.
install -d /var/www/letsencrypt
cat > /etc/nginx/sites-available/imi-wordcloud <<'EOF'
server {
 listen 80;
 server_name imi-cloudpoll.ru;
 location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
 location / { return 503; }
}
EOF
ln -sfn /etc/nginx/sites-available/imi-wordcloud /etc/nginx/sites-enabled/imi-wordcloud
nginx -t
systemctl reload nginx
certbot certonly --non-interactive --agree-tos --email "$1" --webroot -w /var/www/letsencrypt -d imi-cloudpoll.ru
install -m 644 ops/nginx-proxy.conf /etc/nginx/imi-wordcloud-proxy.conf
install -m 644 ops/nginx.conf /etc/nginx/sites-available/imi-wordcloud
nginx -t
systemctl reload nginx
install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nnginx -t && systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/imi-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/imi-nginx
systemctl enable --now certbot.timer
certbot renew --dry-run
