import QRCode from 'qrcode';
import { screenState } from '@/lib/polls';
import { failure, HttpError } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; audience: string }> },
) {
  try {
    const { slug, audience } = await params;
    const event = await screenState(slug);
    if (!event.audiences.some((a) => a.key === audience))
      throw new HttpError(404, 'Группа не найдена.');
    if (!process.env.APP_ORIGIN) throw new HttpError(503, 'Адрес сервиса ещё не настроен.');
    const url = `${new URL(process.env.APP_ORIGIN).origin}/e/${encodeURIComponent(slug)}/${encodeURIComponent(audience)}`;
    return new Response(
      await QRCode.toString(url, { type: 'svg', margin: 1, width: 176, errorCorrectionLevel: 'M' }),
      { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
