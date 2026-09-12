import { getStamp } from '@/lib/catalog';
export const dynamic = 'force-dynamic';
export function GET(_: Request, { params }: { params: { id: string } }) {
  const stamp = getStamp(params.id);
  return Response.json(stamp || { error: 'Timbre introuvable.' }, { status: stamp ? 200 : 404 });
}
