import { getDb } from '@/lib/database';
import { saveCollection } from '@/lib/collection';
import { apiError, sameOrigin } from '@/lib/http';
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try { sameOrigin(request); return Response.json(await saveCollection(await getDb(), params.id, await request.json())); }
  catch (error) { return apiError(error); }
}
