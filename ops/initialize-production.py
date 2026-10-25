from pathlib import Path
import secrets,re,os
root=Path('/opt/imi-wordcloud/shared')
key=(root/'gigachat-key').read_text().strip()
if not re.fullmatch(r'[A-Za-z0-9+/=]+',key): raise SystemExit('Invalid GigaChat credential format')
pw=root/'db-password'
if not pw.exists(): pw.write_text(secrets.token_hex(32))
password=pw.read_text().strip()
(root/'compose.env').write_text('POSTGRES_PASSWORD='+password+'\n')
(root/'app.env').write_text('NODE_ENV=production\nAPP_ORIGIN=https://imi-cloudpoll.ru\nDATABASE_URL=postgresql://mir:'+password+'@db:5432/mir_wordcloud\nDB_POOL_MAX=10\nGIGACHAT_ENABLED=true\nGIGACHAT_SCOPE=GIGACHAT_API_PERS\nGIGACHAT_TIMEOUT_MS=20000\nGIGACHAT_MAX_INPUT_WORDS=150\nGIGACHAT_CA_BUNDLE=/run/certs/russian-trusted-ca.pem\nGIGACHAT_AUTH_KEY='+key+'\n')
for p in [pw,root/'app.env',root/'compose.env',root/'gigachat-key']: p.chmod(0o600)
(root/'certs').chmod(0o755)
(root/'certs/russian-trusted-ca.pem').chmod(0o644)
print('Production environment prepared; credentials not printed')
