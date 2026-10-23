import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/auth';
import { commandInput } from '@/lib/admin/contracts';
import { eventCommand } from '@/lib/admin/events';
import { failure, HttpError, json, readJson, requireOrigin } from '@/lib/http';
export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const { eventId } = await params;
    if (!z.uuid().safeParse(eventId).success)
      throw new HttpError(400, 'Некорректный адрес мероприятия.');
    const input = commandInput.safeParse(await readJson(request));
    if (!input.success) throw new HttpError(400, 'Проверьте поля формы и выбранные группы.');
    return json(await eventCommand(eventId, input.data));
  } catch (error) {
    return failure(error);
  }
}
