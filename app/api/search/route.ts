import { getDb } from '@/lib/database';
import { getStamps } from '@/lib/catalog';
import { searchStamps } from '@/lib/search';
import { InputError } from '@/lib/collection';
import { apiError, sameOrigin } from '@/lib/http';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { text = '', kind, vector } = await request.json();
    if (typeof text !== 'string' || text.length > 500 || (kind && kind !== 'visual' && kind !== 'semantic') || (kind && !vector)) throw new InputError('Paramètres de recherche invalides.');
    const db = await getDb();
    const results = await searchStamps(db, text, kind, vector);
    const stamps = await getStamps(results.map(result => result.id), db);
    const scores = new Map(results.map(result => [result.id, result.score]));
    return Response.json({ items: stamps.map(stamp => ({ ...stamp, score: scores.get(stamp.id)! })) });
  } catch (error) { return apiError(error); }
}
