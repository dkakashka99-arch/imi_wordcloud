import { screenState } from '@/lib/polls';
import { failure, json } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    return json(await screenState((await params).slug));
  } catch (error) {
    return failure(error);
  }
}
