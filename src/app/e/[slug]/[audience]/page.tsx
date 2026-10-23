import { Participant } from '@/components/Participant';
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; audience: string }>;
}) {
  const { slug, audience } = await params;
  return <Participant slug={slug} audience={audience} />;
}
