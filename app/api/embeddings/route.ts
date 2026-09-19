import { getDb } from '@/lib/database';
import { InputError } from '@/lib/collection';
import { apiError, sameOrigin } from '@/lib/http';
import { validateVector } from '@/lib/search';
import { MODELS, type EmbeddingKind } from '@/lib/types';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind !== 'visual' && kind !== 'semantic') return Response.json({ error: 'Type de modèle invalide.' }, { status: 400 });
  const db = await getDb();
  // A notice without an illustration can never get a visual vector: report it as
  // unavailable instead of leaving it "pending" forever.
  const missing = kind === 'visual' ? " AND image_url <> ''" : '';
  const statements = [
    { sql: 'SELECT stamp_id FROM embeddings WHERE kind=? AND model=?', args: [kind, MODELS[kind]] },
    { sql: `SELECT id, title, description, series, year FROM stamps WHERE id NOT IN
      (SELECT stamp_id FROM embeddings WHERE kind=? AND model=?)${missing} ORDER BY id`, args: [kind, MODELS[kind]] },
  ];
  if (kind === 'visual') statements.push({ sql: `SELECT id FROM stamps WHERE image_url = '' AND id NOT IN
    (SELECT stamp_id FROM embeddings WHERE kind=? AND model=?) ORDER BY id`, args: [kind, MODELS[kind]] });
  const [readyResult, pendingResult, unavailableResult] = await db.batch(statements, 'read');
  const ready = readyResult.rows.map(row => String(row.stamp_id));
  const pending = pendingResult.rows.map(row => ({ id: String(row.id), title: String(row.title), description: String(row.description), series: String(row.series), year: Number(row.year) }));
  const unavailable = unavailableResult?.rows.map(row => String(row.id)) || [];
  return Response.json({ ready, pending, unavailable, model: MODELS[kind] });
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { kind, model, items } = await request.json() as { kind: EmbeddingKind; model: string; items: { id: string; vector: number[] }[] };
    if ((kind !== 'visual' && kind !== 'semantic') || model !== MODELS[kind] || !Array.isArray(items) || !items.length || items.length > 10) throw new InputError('Lot de vecteurs invalide.');
    for (const item of items) {
      if (!item || typeof item.id !== 'string') throw new InputError('Timbre introuvable.');
      validateVector(item.vector, kind);
    }
    const db = await getDb();
    const ids = [...new Set(items.map(item => item.id))];
    const found = await db.execute({ sql: `SELECT id FROM stamps WHERE id IN (${ids.map(() => '?').join(',')})`, args: ids });
    const known = new Set(found.rows.map(row => String(row.id)));
    if (ids.some(id => !known.has(id))) throw new InputError('Timbre introuvable.');
    await db.batch(items.map(item => ({
      sql: `INSERT INTO embeddings(stamp_id,kind,model,vector_json) VALUES(?,?,?,?)
        ON CONFLICT(stamp_id,kind,model) DO UPDATE SET vector_json=excluded.vector_json`,
      args: [item.id, kind, model, JSON.stringify(item.vector)],
    })), 'write');
    return Response.json({ saved: items.length });
  } catch (error) { return apiError(error); }
}
