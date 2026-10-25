import os,re,base64,textwrap,sys
from pathlib import Path
value=os.environ.get('DEPLOY_KEY',os.environ.get('DEPLOY_SSH_KEY','')).strip().replace('\r','').replace('\\n','\n')
m=re.search(r'-----BEGIN OPENSSH PRIVATE KEY-----\s*(.*?)\s*-----END OPENSSH PRIVATE KEY-----',value,re.S)
if not m: value=value.replace('-----BEGIN OPENSSH PRIVATE KEY-----','').replace('-----END OPENSSH PRIVATE KEY-----','')
try: payload=re.sub(r'\s+','',m.group(1) if m else value); raw=base64.b64decode(payload,validate=True)
except Exception: raise SystemExit('DEPLOY_SSH_KEY: invalid base64 payload')
if not raw.startswith(b'openssh-key-v1\0'): raise SystemExit('DEPLOY_SSH_KEY: invalid OpenSSH payload')
path=Path(sys.argv[1])
path.write_text('-----BEGIN OPENSSH PRIVATE KEY-----\n'+'\n'.join(textwrap.wrap(payload,70))+'\n-----END OPENSSH PRIVATE KEY-----\n')
path.chmod(0o600)
print('SSH private-key formatting normalized; contents withheld')
