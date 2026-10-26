import { withRequestTrace, requestTraceId } from '@/lib/diagnostics';
import { submit } from '@/lib/polls';
import { failure, json, participantIdentity, requireOrigin, HttpError } from '@/lib/http';
import { submissionInput } from '@/lib/contracts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; audience: string }> },
) {
  return withRequestTrace(async () => {
    let response: Response;
    try {
      requireOrigin(request);
      const hash = await participantIdentity();
      if (Number(request.headers.get('content-length') || 0) > 2048)
        throw new HttpError(413, 'Слишком большой запрос.');
      const reader = request.body?.getReader();
      if (!reader) throw new HttpError(400, 'Пустой запрос.');
      const parts: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2048) {
          await reader.cancel();
          throw new HttpError(413, 'Слишком большой запрос.');
        }
        parts.push(value);
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(parts).toString('utf8'));
      } catch {
        throw new HttpError(400, 'Некорректный JSON.');
      }
      const input = submissionInput.safeParse(body);
      if (!input.success) throw new HttpError(400, 'Проверьте формат ответа.');
      const { slug, audience } = await params;
      response = json(await submit(slug, audience, hash, input.data));
    } catch (error) {
      response = failure(error);
    }
    response.headers.set('X-Request-ID', requestTraceId()!);
    return response;
  });
}
