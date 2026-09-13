import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStamp } from '../scripts/wikitimbres/parse';

// Fixture synthétique : structure de notice représentative, contenu entièrement inventé.
// Aucune page tierce n'est publiée dans le dépôt (voir DATA-LICENSE.md).
const fixture = readFileSync(new URL('./fixtures/wikitimbres-synthetic.html', import.meta.url), 'utf8');
const source = 'https://www.wikitimbres.fr/timbres/1';

afterEach(() => vi.restoreAllMocks());

describe('notice structurée, sans réseau', () => {
  it('extrait les valeurs réellement présentes et signale le pays par défaut', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const row = parseStamp(fixture, 1, source)!;
    expect(row.title).toContain('Éclat');
    expect(row.title).toBe('Phare de l’Éclat — type Démo');
    expect(row.color).toBe('bleu de cobalt');
    expect(row.denomination).toBe('10 c');
    expect(row.series).toBe('Phares et balises 1902-1904');
    expect(row.year).toBe('1902');
    expect(row.catalog_number).toBe('1');
    expect(row.country).toBe('France');
    expect(row.description).toBe('Type Démo. Légende PHARE FICTIF');
    expect(row.image_url).toBe('');
    expect(row.image_credit).toBe('');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('France retenue par défaut'));
  });

  it('ne déduit ni année du titre ou du groupe, ni référence d’un autre catalogue', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseStamp(fixture.replace('12/09/1902', ''), 1, source)).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('année d’émission absente ou invalide'));
    expect(parseStamp(fixture.replace('>Tellier<', '>Autre catalogue<'), 1, source)!.catalog_number).toBe('');
    expect(parseStamp(fixture.replace('12/09/1902', '12/09/1903'), 1, source)!.year).toBe('1903');
  });

  it('respecte un pays explicite dans le fil d’Ariane', () => {
    const html = fixture.replace('<div class="breadcrumb">',
      '<div class="breadcrumb"><a href="/pays/monaco">Monaco</a> &gt; ');
    expect(parseStamp(html, 1, source)!.country).toBe('Monaco');
  });

  it('lit un commentaire dédié ou compose les faits en l’absence de description', () => {
    const base = '<h1>Timbre : Test</h1><li><span class="timInfoLabel">&Eacute;mission</span>' +
      '<i></i><span class="timInfo">01/02/1960</span></li>';
    const comment = '<table><tr><td class="timInfoLabel2">Commentaire</td>' +
      '<td class="timInfo2"><p>Texte de test.</p></td></tr></table>';
    expect(parseStamp(base + comment, 2, source)!.description).toBe('Texte de test.');
    const html = base + ['Couleur:bleu', 'Valeur:10 c', 'Groupe:Test'].map(pair => {
      const [label, value] = pair.split(':');
      return `<li><span class="timInfoLabel">${label}</span><span class="timInfo">${value}</span></li>`;
    }).join('');
    expect(parseStamp(html, 2, source)!.description).toBe(
      'Pays : France ; Année : 1960 ; Valeur faciale : 10 c ; Couleur : bleu ; Groupe : Test');
  });
});
