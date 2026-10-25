import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/auth';
import { moderationInput, moderationState, moderate } from '@/lib/admin/moderation';
import { failure, HttpError, json, readJson, requireOrigin } from '@/lib/http';
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
    const page = Number(new URL(request.url).searchParams.get('page') || 0);
    if (!Number.isInteger(page) || page < 0 || page > 100000)
      throw new HttpError(400, 'Некорректная страница.');
    return json(await moderationState(p.eventId, p.questionId, page));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, ctx: Context) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const p = await ids(ctx);
    const input = moderationInput.safeParse(await readJson(request, 131072));
    if (!input.success) throw new HttpError(400, 'Проверьте правила модерации.');
    return json(await moderate(p.eventId, p.questionId, input.data));
  } catch (e) {
    return failure(e);
  }
}
