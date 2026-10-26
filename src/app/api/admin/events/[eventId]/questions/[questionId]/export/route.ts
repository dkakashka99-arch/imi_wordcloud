import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/auth';
import { exportAnswers } from '@/lib/admin/moderation';
import { failure, HttpError } from '@/lib/http';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string; questionId: string }> },
) {
  try {
    await requireAdmin();
    const p = await params;
    if (!z.uuid().safeParse(p.eventId).success || !z.uuid().safeParse(p.questionId).success)
      throw new HttpError(400, 'Некорректный адрес.');
    const mode = new URL(request.url).searchParams.get('mode');
    if (mode && mode !== 'aggregate' && mode !== 'raw')
      throw new HttpError(400, 'Некорректный вид экспорта.');
    return new Response(await exportAnswers(p.eventId, p.questionId, mode === 'aggregate'), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="wordcloud-${p.questionId}-${mode === 'aggregate' ? 'counts' : 'answers'}.csv"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
