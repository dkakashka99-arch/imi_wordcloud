import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers.js';
import { database } from '@/db/client';
import { HttpError } from '@/lib/http';
import { hashPassword, verifyPassword } from './password';
export const adminCookie = 'mir_admin_session';
export const sessionSeconds = 12 * 60 * 60;
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const validLogin = (value: string) => /^[a-z0-9][a-z0-9_-]{2,63}$/u.test(value);
export async function createAdmin(login: string, password: string) {
  login = login.trim().toLowerCase();
  if (!validLogin(login))
    throw new Error('Login must contain 3–64 lowercase Latin letters, digits, _ or -');
  const hash = await hashPassword(password);
  const r = await database().query(
    'INSERT INTO admins(login,password_hash) VALUES($1,$2) RETURNING id,login',
    [login, hash],
  );
  return r.rows[0] as { id: string; login: string };
}
export async function consumeLoginLimit(key: string, limit: number, seconds: number) {
  const r = await database().query(
    `INSERT INTO login_limits(key,attempts,reset_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_limits.reset_at<=now() THEN 1 ELSE login_limits.attempts+1 END,
    reset_at=CASE WHEN login_limits.reset_at<=now() THEN now()+$2*interval '1 second' ELSE login_limits.reset_at END RETURNING attempts`,
    [key, seconds],
  );
  if (r.rows[0].attempts > limit)
    throw new HttpError(429, 'Слишком много попыток входа. Попробуйте позже.');
}
export async function loginAdmin(login: string, password: string) {
  login = login.trim().toLowerCase();
  await consumeLoginLimit('login:global', 60, 60);
  await consumeLoginLimit(`login:${digest(login)}`, 10, 15 * 60);
  const r = await database().query(
    'SELECT id,login,password_hash,active FROM admins WHERE login=$1',
    [login],
  );
  const admin = r.rows[0];
  const valid = await verifyPassword(password, admin?.password_hash);
  if (!valid || !admin?.active) throw new HttpError(401, 'Неверный логин или пароль.');
  const token = randomBytes(32).toString('hex');
  await database().query(
    "INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES($1,$2,now()+$3*interval '1 second')",
    [digest(token), admin.id, sessionSeconds],
  );
  return { token, admin: { id: admin.id as string, login: admin.login as string } };
}
export async function sessionAdmin(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/u.test(token)) return null;
  const r = await database().query(
    `SELECT a.id,a.login FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active`,
    [digest(token)],
  );
  return (r.rows[0] as { id: string; login: string } | undefined) ?? null;
}
export async function requireAdmin() {
  const admin = await sessionAdmin((await cookies()).get(adminCookie)?.value);
  if (!admin) throw new HttpError(401, 'Войдите в кабинет организатора.');
  return admin;
}
export async function revokeSession(token: string) {
  await database().query('DELETE FROM admin_sessions WHERE token_hash=$1', [digest(token)]);
}
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: sessionSeconds,
};
