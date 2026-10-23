import { cookies } from 'next/headers';
import { requireAdmin, adminCookie, revokeSession, sessionCookieOptions } from '@/lib/admin/auth';
import { failure, json, requireOrigin } from '@/lib/http';
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await requireAdmin();
    const jar = await cookies();
    const token = jar.get(adminCookie)?.value;
    if (token) await revokeSession(token);
    jar.set(adminCookie, '', { ...sessionCookieOptions, maxAge: 0 });
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
