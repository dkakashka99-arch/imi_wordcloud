import { Screen } from '@/components/Screen';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ audience?: string }>;
}) {
  return (
    <Screen
      slug={(await params).slug}
      audience={(await searchParams).audience}
      origin={process.env.APP_ORIGIN || ''}
    />
  );
}
