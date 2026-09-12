import { collectionStats, listStamps } from '@/lib/catalog';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const params = new URL(request.url).searchParams; params.set('owned','1');
  return Response.json({ ...listStamps(params), stats: collectionStats() });
}
