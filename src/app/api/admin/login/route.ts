import { cookies } from 'next/headers';
import { loginAdmin, adminCookie, sessionCookieOptions } from '@/lib/admin/auth';
import { loginInput } from '@/lib/admin/contracts';
import { failure, HttpError, json, readJson, requireOrigin } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const input = loginInput.safeParse(await readJson(request, 2048));
    if (!input.success) throw new HttpError(400, 'Введите логин и пароль.');
    const result = await loginAdmin(input.data.login, input.data.password);
    (await cookies()).set(adminCookie, result.token, sessionCookieOptions);
    return json({ admin: result.admin });
  } catch (error) {
    return failure(error);
  }
}
