import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'csv-parse/sync';
import { FIELDS, parseStamp } from '../scripts/wikitimbres/parse';
import { csv } from '../scripts/wikitimbres/store';

const fixture = readFileSync(new URL('./fixtures/wikitimbres.html', import.meta.url), 'utf8');
const source = 'https://www.wikitimbres.fr/timbres/1';

describe('extraction locale Wikitimbres', () => {
  it('extrait les faits, décode les entités et exclut illustrations et prose', () => {
    const row = parseStamp(fixture, 1, source)!;
    expect(row).toEqual({
      id: 'wikitimbres-1', title: '1950 — Poste & paysages', country: 'France', year: '1950',
      series: 'Paysages, "grand format"', denomination: '15 F', color: 'bleu & vert',
      description: 'Pays : France ; Année : 1950 ; Valeur faciale : 15 F ; Couleur : bleu & vert ; Groupe : Paysages, "grand format" ; Thème : Paysages',
      image_url: '', image_credit: '', source_url: source, catalog_number: 'TEST-001 a',
      estimated_value: '', currency: 'EUR',
    });
    expect(JSON.stringify(row)).not.toMatch(/never-download|éditorial|Crédit/);
  });
  it('produit les colonnes importables et échappe les guillemets et virgules', () => {
    const row = parseStamp(fixture, 1, source)!;
    // csv-parse renvoie `unknown` sans annotation : le schéma attendu est celui de FIELDS.
    const result = parse(csv([row]), { columns: true }) as Record<(typeof FIELDS)[number], string>[];
    expect(Object.keys(result[0])).toEqual([...FIELDS]);
    expect(result).toEqual([Object.fromEntries(FIELDS.map(field => [field, row[field]]))]);
  });
  it('ignore les pages incomplètes, les années invalides et les titres trop longs', () => {
    expect(parseStamp('<h1>Page inexistante</h1>', 1, source)).toBeNull();
    expect(parseStamp(fixture.replace('1950</td>', '1839</td>'), 1, source)).toBeNull();
    expect(parseStamp(fixture.replace('France</td>', '</td>'), 1, 'https://example.test/notice/1')).toBeNull();
    expect(parseStamp(fixture.replace('1950 — Poste &amp; paysages', 'x'.repeat(2001)), 1, source)).toBeNull();
  });
  it('lit aussi les listes et n’invente pas de référence ni de série', () => {
    const row = parseStamp('<h1>Poste</h1><ul><li><b>Pays :</b> France</li><li>Année : 1960</li></ul>', 2, source)!;
    expect(row.country).toBe('France');
    expect(row.year).toBe('1960');
    expect(row.series).toBe('Série non renseignée');
    expect(row.catalog_number).toBe('');
    expect(row.denomination).toBe('');
  });
});
