import type { Client } from '@libsql/client';
import type { CollectionEntry } from './types';
export class InputError extends Error {}
export function validateCollection(value: unknown): CollectionEntry {
  const data = value as Partial<CollectionEntry> | null;
  if (!data || typeof data.owned !== 'boolean' || !Number.isInteger(data.quantity) ||
      data.quantity! < 0 || data.quantity! > 9999 || typeof data.personal_reference !== 'string' || data.personal_reference.length > 500)
    throw new InputError('Saisissez une quantité entière de 0 à 9999 et une référence de 500 caractères maximum.');
  return { owned: data.owned, quantity: data.owned ? Math.max(1, data.quantity!) : 0, personal_reference: data.personal_reference.trim() };
}
export async function saveCollection(db: Client, id: string, value: unknown) {
  const entry = validateCollection(value);
  const result = await db.execute({
    sql: `INSERT INTO collection_entries(stamp_id, owned, quantity, personal_reference)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM stamps WHERE id = ?)
      ON CONFLICT(stamp_id) DO UPDATE SET owned=excluded.owned, quantity=excluded.quantity,
      personal_reference=excluded.personal_reference, updated_at=CURRENT_TIMESTAMP`,
    args: [id, Number(entry.owned), entry.quantity, entry.personal_reference, id],
  });
  if (result.rowsAffected === 0) throw new InputError('Timbre introuvable.');
  return entry;
}
