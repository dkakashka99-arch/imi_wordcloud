import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const cookieName = 'mir_participant';
export async function participantIdentity(create = false) {
  const jar = await cookies();
  let id = jar.get(cookieName)?.value;
  if (!id || !/^[a-f0-9]{64}$/u.test(id)) {
    if (!create) throw new HttpError(401, 'Обновите страницу перед отправкой ответа.');
    id = randomBytes(32).toString('hex');
    jar.set(cookieName, id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return createHash('sha256').update(id).digest('hex');
}
export function requireOrigin(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new HttpError(503, 'Адрес сервиса ещё не настроен.');
  if (request.headers.get('origin') !== new URL(origin).origin)
    throw new HttpError(403, 'Недопустимый источник запроса.');
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    throw new HttpError(415, 'Требуется JSON.');
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  // Do not expose SQL, submitted text, cookies or credentials in responses/logs.
  console.error('API operation failed', error instanceof Error ? error.name : 'UnknownError');
  return json({ error: 'Сервис временно недоступен. Попробуйте ещё раз.' }, 503);
}
