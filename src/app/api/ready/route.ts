import { database } from '@/db/client';
import { json, failure } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await database().query('SELECT id FROM events LIMIT 0');
    return json({ status: 'ready' });
  } catch (error) {
    return failure(error);
  }
}
