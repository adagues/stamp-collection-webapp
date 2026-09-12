import { getDb } from '@/lib/database';
import { getStamp } from '@/lib/catalog';
import { searchStamps } from '@/lib/search';
import { InputError } from '@/lib/collection';
import { apiError, sameOrigin } from '@/lib/http';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { text = '', kind, vector } = await request.json();
    if (typeof text !== 'string' || text.length > 500 || (kind && kind !== 'visual' && kind !== 'semantic') || (kind && !vector)) throw new InputError('Paramètres de recherche invalides.');
    return Response.json({ items: searchStamps(getDb(), text, kind, vector).map(result => ({ ...getStamp(result.id)!, score: result.score })) });
  } catch (error) { return apiError(error); }
}
