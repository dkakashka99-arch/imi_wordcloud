import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/auth';
import { aiCommand, taskKind } from '@/lib/ai/contracts';
import { aiState, startAnalysis, reviewAnalysis } from '@/lib/ai/jobs';
import { AiError } from '@/lib/ai/client';
import { failure, HttpError, json, readJson, requireOrigin } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ eventId: string; questionId: string }> };
async function ids(ctx: Context) {
  const p = await ctx.params;
  if (!z.uuid().safeParse(p.eventId).success || !z.uuid().safeParse(p.questionId).success)
    throw new HttpError(400, 'Некорректный адрес.');
  return p;
}
export async function GET(request: Request, ctx: Context) {
  try {
    await requireAdmin();
    const p = await ids(ctx);
    const kind = taskKind.safeParse(new URL(request.url).searchParams.get('kind') || 'moderation');
    if (!kind.success) throw new HttpError(400, 'Некорректный вид анализа.');
    return json(await aiState(p.eventId, p.questionId, kind.data));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, ctx: Context) {
  try {
    requireOrigin(request);
    const admin = await requireAdmin();
    const p = await ids(ctx);
    const command = aiCommand.safeParse(await readJson(request, 131072));
    if (!command.success) throw new HttpError(400, 'Проверьте выбранные слова и действие.');
    return json(
      command.data.action === 'start'
        ? await startAnalysis(p.eventId, p.questionId, admin.id, command.data)
        : await reviewAnalysis(p.eventId, p.questionId, command.data),
    );
  } catch (e) {
    if (e instanceof AiError)
      return json({ error: 'ИИ временно недоступен. Опрос продолжает работать.' }, 503);
    return failure(e);
  }
}
