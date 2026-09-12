import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { getDb, importStamps } from '../lib/database';
import type { Stamp } from '../lib/types';
const fields = ['id','title','country','year','series','denomination','description','image_url','image_credit','source_url','catalog_number','estimated_value','currency'];
function https(value: string) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }
try {
  const path = process.argv[2];
  if (!path) throw new Error('Indiquez le chemin du fichier CSV à importer.');
  const rows = parse(readFileSync(path, 'utf8'), { columns: true, bom: true, skip_empty_lines: true, trim: true }) as Record<string,string>[];
  if (!rows.length || fields.some(key => !(key in rows[0]))) throw new Error('Le fichier doit contenir toutes les colonnes du schéma.');
  const ids = new Set<string>();
  const stamps = rows.map((row, index): Stamp => {
    const year = Number(row.year), value = row.estimated_value === '' ? null : Number(row.estimated_value);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(row.id) || ids.has(row.id) || !Number.isInteger(year) || year < 1840 || year > 2100 ||
      ['title','country','series','description'].some(key => !row[key] || row[key].length > 2000) || !https(row.source_url) ||
      (row.image_url && !https(row.image_url)) || !/^[A-Z]{3}$/.test(row.currency) || (value !== null && (!Number.isFinite(value) || value < 0)))
      throw new Error(`Ligne ${index+2} : données invalides ou identifiant dupliqué.`);
    ids.add(row.id);
    return { id: row.id, title: row.title, country: row.country, year, series: row.series, denomination: row.denomination,
      description: row.description, image_url: row.image_url, image_credit: row.image_credit, source_url: row.source_url,
      catalog_number: row.catalog_number || null, estimated_value: value, currency: row.currency };
  });
  importStamps(getDb(), stamps);
  console.log(`${stamps.length} notices importées. Préparez à nouveau leurs vecteurs depuis la recherche.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Échec de l’import du catalogue.');
  process.exitCode = 1;
}
