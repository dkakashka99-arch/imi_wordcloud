import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/auth';
import { HttpError } from '@/lib/http';
import { listEvents } from '@/lib/admin/events';
import { AdminHeader } from '@/components/admin/Header';
import { Dashboard } from '@/components/admin/Dashboard';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect('/admin/login');
    throw e;
  }
  return (
    <main className="shell">
      <AdminHeader login={admin.login} />
      <Dashboard events={await listEvents()} />
    </main>
  );
}
