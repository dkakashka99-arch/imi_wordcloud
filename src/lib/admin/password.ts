import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
// OWASP's equivalent 32 MiB scrypt profile; kept fixed, never supplied by a client/hash.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, parameters, (error, key) => (error ? reject(error) : resolve(key))),
  );
}
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 256)
    throw new Error('Password must contain 12–256 characters');
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded?: string) {
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/u.exec(encoded || '');
  const salt = match?.[1] || '0'.repeat(32);
  const expected = Buffer.from(match?.[2] || '0'.repeat(128), 'hex');
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected) && !!match;
}
