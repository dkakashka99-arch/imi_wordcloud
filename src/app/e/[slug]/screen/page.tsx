import { Screen } from '@/components/Screen';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <Screen slug={(await params).slug} origin={process.env.APP_ORIGIN || ''} />;
}
