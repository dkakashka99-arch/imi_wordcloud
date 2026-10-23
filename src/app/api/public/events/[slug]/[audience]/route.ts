import { participantState } from '@/lib/polls';
import { failure, json, participantIdentity } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; audience: string }> },
) {
  try {
    const { slug, audience } = await params;
    return json(await participantState(slug, audience, await participantIdentity(true)));
  } catch (error) {
    return failure(error);
  }
}
