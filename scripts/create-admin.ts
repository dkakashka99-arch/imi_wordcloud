import { readFile } from 'node:fs/promises';
import { database } from '../src/db/client';
import { createAdmin } from '../src/lib/admin/auth';
// Secret arrives through a mounted file or stdin, never argv, output, seed or Git.
const login = process.argv[2];
if (!login)
  throw new Error(
    'Usage: npm run admin:create -- LOGIN; password via ADMIN_PASSWORD_FILE or stdin',
  );
if (!process.env.ADMIN_PASSWORD_FILE && process.stdin.isTTY)
  throw new Error('Provide ADMIN_PASSWORD_FILE or password on stdin (not on command line).');
let input: string;
if (process.env.ADMIN_PASSWORD_FILE) {
  input = await readFile(process.env.ADMIN_PASSWORD_FILE, 'utf8');
} else {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 4096) throw new Error('Password input too large');
    chunks.push(Buffer.from(chunk));
  }
  input = Buffer.concat(chunks).toString('utf8');
}
const password = input.replace(/\r?\n$/u, '');
try {
  const admin = await createAdmin(login, password);
  console.log(`Administrator created: ${admin.login}`);
} catch {
  console.error('Administrator creation failed. Check login, password length and uniqueness.');
  process.exitCode = 1;
} finally {
  await database().end();
}
