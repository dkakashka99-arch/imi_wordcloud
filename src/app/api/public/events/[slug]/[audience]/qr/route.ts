import QRCode from 'qrcode';
import { screenState } from '@/lib/polls';
import { failure, HttpError } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; audience: string }> },
) {
  try {
    const { slug, audience } = await params;
    const event = await screenState(slug);
    if (!event.audiences.some((a) => a.key === audience))
      throw new HttpError(404, 'Группа не найдена.');
    if (!process.env.APP_ORIGIN) throw new HttpError(503, 'Адрес сервиса ещё не настроен.');
    const url = `${new URL(process.env.APP_ORIGIN).origin}/e/${encodeURIComponent(slug)}/${encodeURIComponent(audience)}`;
    const png = new URL(request.url).searchParams.get('format') === 'png';
    const body = png
      ? new Uint8Array(
          await QRCode.toBuffer(url, {
            type: 'png',
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'M',
          }),
        )
      : await QRCode.toString(url, {
          type: 'svg',
          margin: 1,
          width: 176,
          errorCorrectionLevel: 'M',
        });
    return new Response(body, {
      headers: {
        'Content-Type': png ? 'image/png' : 'image/svg+xml',
        'Cache-Control': 'no-store',
        ...(new URL(request.url).searchParams.has('download')
          ? { 'Content-Disposition': `attachment; filename="qr-code.${png ? 'png' : 'svg'}"` }
          : {}),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
