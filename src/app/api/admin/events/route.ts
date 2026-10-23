import { requireAdmin } from '@/lib/admin/auth';
import { createEventInput } from '@/lib/admin/contracts';
import { createEvent, listEvents } from '@/lib/admin/events';
import { failure, HttpError, json, readJson, requireOrigin } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await requireAdmin();
    return json({ events: await listEvents() });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const input = createEventInput.safeParse(await readJson(request));
    if (!input.success) throw new HttpError(400, 'Проверьте название и адрес мероприятия.');
    return json(await createEvent(input.data.title, input.data.slug), 201);
  } catch (error) {
    return failure(error);
  }
}
