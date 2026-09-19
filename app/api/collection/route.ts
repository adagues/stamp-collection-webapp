import { collectionStats, listStamps } from '@/lib/catalog';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams; params.set('owned','1');
  const [stamps, stats] = await Promise.all([listStamps(params), collectionStats()]);
  return Response.json({ ...stamps, stats });
}
