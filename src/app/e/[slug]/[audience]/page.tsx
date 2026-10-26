import { Participant } from '@/components/Participant';
import { database } from '@/db/client';
import { redirect } from 'next/navigation';
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; audience: string }>;
}) {
  const { slug, audience } = await params;
  const result = await database().query(
    'SELECT public_audience_key FROM events WHERE slug=$1 AND NOT archived',
    [slug],
  );
  const key = result.rows[0]?.public_audience_key;
  if (key && key !== audience)
    redirect(`/e/${encodeURIComponent(slug)}/${encodeURIComponent(key)}`);
  return <Participant slug={slug} audience={audience} />;
}
