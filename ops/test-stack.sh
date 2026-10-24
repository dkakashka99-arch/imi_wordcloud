#!/usr/bin/env bash
set -Eeuo pipefail
# CI only: a unique project and volume, never run against production.
export RELEASE=ci-test
work=$(mktemp -d)
trap 'docker rm -f imi-infra-nginx >/dev/null 2>&1 || true; docker compose -p imi-infra-test --env-file "$work/compose.env" -f compose.production.yaml -f "$work/override.yaml" down -v; rm -rf "$work"' EXIT
export APP_ENV_FILE="$work/app.env" CERTS_DIR="$work/certs"
mkdir -p "$CERTS_DIR"
printf 'POSTGRES_PASSWORD=ci-only-password\n' > "$work/compose.env"
cat > "$APP_ENV_FILE" <<'EOF'
DATABASE_URL=postgresql://mir:ci-only-password@db:5432/mir_wordcloud
APP_ORIGIN=https://imi-cloudpoll.ru
GIGACHAT_ENABLED=false
EOF
cat > "$work/override.yaml" <<'EOF'
volumes:
  postgres:
    name: imi-infra-test-postgres
EOF
c=(docker compose -p imi-infra-test --env-file "$work/compose.env" -f compose.production.yaml -f "$work/override.yaml")
docker build --target runtime -t imi-wordcloud:ci-test .
docker build --target tools -t imi-wordcloud-tools:ci-test .
"${c[@]}" config --quiet
"${c[@]}" up -d --wait db
"${c[@]}" run --rm -T tools
"${c[@]}" run --rm -T tools
"${c[@]}" up -d --wait --wait-timeout 120 app
# Verify actual Nginx syntax + TLS + redirects using a test-only local CA.
mkdir -p "$work/tls/live/imi-cloudpoll.ru"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=imi-cloudpoll.ru' -addext 'subjectAltName=DNS:imi-cloudpoll.ru' -keyout "$work/tls/live/imi-cloudpoll.ru/privkey.pem" -out "$work/tls/live/imi-cloudpoll.ru/fullchain.pem" 2>/dev/null
docker run --rm --network host -v "$PWD/ops/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/ops/nginx-proxy.conf:/etc/nginx/imi-wordcloud-proxy.conf:ro" -v "$work/tls:/etc/letsencrypt:ro" nginx:stable nginx -t
docker run -d --name imi-infra-nginx --network host --memory 128m -v "$PWD/ops/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/ops/nginx-proxy.conf:/etc/nginx/imi-wordcloud-proxy.conf:ro" -v "$work/tls:/etc/letsencrypt:ro" nginx:stable
for attempt in $(seq 1 20); do
  if curl --noproxy '*' --fail --silent --cacert "$work/tls/live/imi-cloudpoll.ru/fullchain.pem" --resolve imi-cloudpoll.ru:443:127.0.0.1 https://imi-cloudpoll.ru/api/ready >/dev/null; then break; fi
  sleep 1
done
curl --noproxy '*' --fail --show-error --cacert "$work/tls/live/imi-cloudpoll.ru/fullchain.pem" --resolve imi-cloudpoll.ru:443:127.0.0.1 https://imi-cloudpoll.ru/api/ready
test "$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' -H 'Host: imi-cloudpoll.ru' http://127.0.0.1/)" = 301
"${c[@]}" run --rm -T -e LOAD_TEST_ALLOWED=true tools node --import tsx scripts/load-production.ts | tee infrastructure-results.txt
"${c[@]}" restart app db
"${c[@]}" up -d --wait --wait-timeout 120 app
"${c[@]}" run --rm -T -e LOAD_TEST_ALLOWED=true -e VERIFY_ONLY=true tools node --import tsx scripts/load-production.ts | tee -a infrastructure-results.txt
# A real pg_dump/pg_restore roundtrip on isolated test data.
"${c[@]}" exec -T db pg_dump -U mir -d mir_wordcloud -Fc > "$work/test.dump"
"${c[@]}" exec -T db createdb -U mir restore_drill
"${c[@]}" exec -T db pg_restore --exit-on-error -U mir -d restore_drill < "$work/test.dump"
test "$("${c[@]}" exec -T db psql -U mir -d restore_drill -Atc 'SELECT count(*) FROM submissions')" = 300
"${c[@]}" exec -T db dropdb -U mir restore_drill
printf 'PASS: restart persistence; pg_dump/pg_restore: 300 responses\n' | tee -a infrastructure-results.txt
