import { listStamps } from '@/lib/catalog';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return Response.json(await listStamps(new URL(request.url).searchParams)); }
