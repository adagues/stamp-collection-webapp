import { getDb } from '@/lib/database';
import { InputError } from '@/lib/collection';
import { apiError, sameOrigin } from '@/lib/http';
import { validateVector } from '@/lib/search';
import { MODELS, type EmbeddingKind } from '@/lib/types';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind !== 'visual' && kind !== 'semantic') return Response.json({ error: 'Type de modèle invalide.' }, { status: 400 });
  const db = getDb();
  const ready = db.prepare('SELECT stamp_id FROM embeddings WHERE kind=? AND model=?').all(kind, MODELS[kind]) as { stamp_id: string }[];
  // A notice without an illustration can never get a visual vector: report it as
  // unavailable instead of leaving it "pending" forever.
  const missing = kind === 'visual' ? " AND image_url <> ''" : '';
  const pending = db.prepare(`SELECT id, title, description, series, year FROM stamps WHERE id NOT IN
    (SELECT stamp_id FROM embeddings WHERE kind=? AND model=?)${missing} ORDER BY id`).all(kind, MODELS[kind]);
  const unavailable = kind === 'visual'
    ? (db.prepare(`SELECT id FROM stamps WHERE image_url = '' AND id NOT IN
        (SELECT stamp_id FROM embeddings WHERE kind=? AND model=?) ORDER BY id`).all(kind, MODELS[kind]) as { id: string }[]).map(row => row.id)
    : [];
  return Response.json({ ready: ready.map(row => row.stamp_id), pending, unavailable, model: MODELS[kind] });
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { kind, model, items } = await request.json() as { kind: EmbeddingKind; model: string; items: { id: string; vector: number[] }[] };
    if ((kind !== 'visual' && kind !== 'semantic') || model !== MODELS[kind] || !Array.isArray(items) || !items.length || items.length > 10) throw new InputError('Lot de vecteurs invalide.');
    const db = getDb();
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !db.prepare('SELECT id FROM stamps WHERE id=?').get(item.id)) throw new InputError('Timbre introuvable.');
      validateVector(item.vector, kind);
    }
    const insert = db.prepare('INSERT OR REPLACE INTO embeddings(stamp_id,kind,model,vector_json) VALUES(?,?,?,?)');
    db.transaction(() => { for (const item of items) insert.run(item.id, kind, model, JSON.stringify(item.vector)); })();
    return Response.json({ saved: items.length });
  } catch (error) { return apiError(error); }
}
