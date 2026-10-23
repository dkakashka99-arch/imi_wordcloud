import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers.js';
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

export async function readJson(request: Request, maxBytes = 8192): Promise<unknown> {
  if (Number(request.headers.get('content-length') || 0) > maxBytes)
    throw new HttpError(413, 'Слишком большой запрос.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Пустой запрос.');
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'Слишком большой запрос.');
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Некорректный JSON.');
  }
}
