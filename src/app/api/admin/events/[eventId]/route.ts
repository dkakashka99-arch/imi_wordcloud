import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/auth';
import { getEvent } from '@/lib/admin/events';
import { failure, HttpError, json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    await requireAdmin();
    const { eventId } = await params;
    if (!z.uuid().safeParse(eventId).success)
      throw new HttpError(400, 'Некорректный адрес мероприятия.');
    return json(await getEvent(eventId));
  } catch (error) {
    return failure(error);
  }
}
