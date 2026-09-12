import type Database from 'better-sqlite3';
import type { CollectionEntry } from './types';
export class InputError extends Error {}
export function validateCollection(value: unknown): CollectionEntry {
  const data = value as Partial<CollectionEntry> | null;
  if (!data || typeof data.owned !== 'boolean' || !Number.isInteger(data.quantity) ||
      data.quantity! < 0 || data.quantity! > 9999 || typeof data.personal_reference !== 'string' || data.personal_reference.length > 500)
    throw new InputError('Saisissez une quantité entière de 0 à 9999 et une référence de 500 caractères maximum.');
  return { owned: data.owned, quantity: data.owned ? Math.max(1, data.quantity!) : 0, personal_reference: data.personal_reference.trim() };
}
export function saveCollection(db: Database.Database, id: string, value: unknown) {
  const entry = validateCollection(value);
  if (!db.prepare('SELECT id FROM stamps WHERE id = ?').get(id)) throw new InputError('Timbre introuvable.');
  db.prepare(`INSERT INTO collection_entries(stamp_id, owned, quantity, personal_reference) VALUES(?,?,?,?)
    ON CONFLICT(stamp_id) DO UPDATE SET owned=excluded.owned, quantity=excluded.quantity,
    personal_reference=excluded.personal_reference, updated_at=CURRENT_TIMESTAMP`)
    .run(id, Number(entry.owned), entry.quantity, entry.personal_reference);
  return entry;
}
