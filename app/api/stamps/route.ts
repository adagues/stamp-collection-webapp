import { listStamps } from '@/lib/catalog';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return Response.json(listStamps(new URL(request.url).searchParams)); }
