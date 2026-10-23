import { z } from 'zod';
import { redirect, notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/auth';
import { getEvent } from '@/lib/admin/events';
import { HttpError } from '@/lib/http';
import { AdminHeader } from '@/components/admin/Header';
import { EventEditor } from '@/components/admin/EventEditor';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect('/admin/login');
    throw e;
  }
  const { eventId } = await params;
  if (!z.uuid().safeParse(eventId).success) notFound();
  let event;
  try {
    event = await getEvent(eventId);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return (
    <main className="shell">
      <AdminHeader login={admin.login} />
      <EventEditor
        initial={event}
        origin={process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : ''}
      />
    </main>
  );
}
