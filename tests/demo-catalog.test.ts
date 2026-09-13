import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import catalog from '../data/catalog.json';

// Le dépôt ne publie qu'un jeu de démonstration inventé : aucune notice, adresse ou
// illustration reprise d'un site tiers. Voir DATA-LICENSE.md pour la portée des licences.
const raw = readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8');
const THIRD_PARTY = ['phil-ouest', 'wikitimbres', 'philouest', 'laposte'];

describe('catalogue de démonstration livré avec le dépôt', () => {
  it('n’expose aucun hôte ni identifiant de source tierce', () => {
    for (const needle of THIRD_PARTY) expect(raw.toLowerCase()).not.toContain(needle);
    for (const stamp of catalog) {
      expect(new URL(stamp.source_url).hostname.endsWith('.invalid'), stamp.id).toBe(true);
      expect(stamp.id.startsWith('demo-'), stamp.id).toBe(true);
    }
  });

  it('se présente explicitement comme fictif, sans pays ni valeur réels', () => {
    expect(catalog.length).toBeGreaterThan(0);
    for (const stamp of catalog) {
      expect(stamp.country, stamp.id).toBe('Démoland');
      expect(stamp.description.toLowerCase(), stamp.id).toContain('démonstration');
      expect(stamp.estimated_value, stamp.id).toBeNull();
    }
  });

  it('ne référence aucune illustration distante à relayer', () => {
    for (const stamp of catalog) {
      expect(stamp.image_url, stamp.id).toBe('');
      expect(stamp.image_credit.toLowerCase(), stamp.id).toContain('aucune illustration');
    }
  });
});
