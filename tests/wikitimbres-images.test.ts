import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_CREDIT, parseStamp } from '../scripts/wikitimbres/parse';

// Fixture synthétique : structure représentative, contenu inventé, aucune page tierce publiée.
const fixture = readFileSync(new URL('./fixtures/wikitimbres-synthetic.html', import.meta.url), 'utf8');
const source = 'https://www.wikitimbres.fr/timbres/1';

afterEach(() => vi.restoreAllMocks());

describe('illustration principale, option explicite et hors ligne', () => {
  it('laisse l’illustration vide sans option, même sur une page qui en contient', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const row = parseStamp(fixture, 1, source)!;
    expect(row.image_url).toBe('');
    expect(row.image_credit).toBe('');
  });

  it('extrait le timbre officiel de la page réelle, pas un logo ni un visuel d’usage', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const row = parseStamp(fixture, 1, source, { images: true })!;
    expect(row.image_url).toBe('https://www.wikitimbres.fr/public/stamps/800/ESSAI-1902-7.jpg');
    expect(row.image_url).not.toContain('/visuels/');
    expect(row.image_url).not.toContain('logo');
    expect(row.image_credit).toBe(IMAGE_CREDIT);
    expect(row.image_credit).toContain('www.wikitimbres.fr');
  });

  it('refuse une adresse d’illustration non conforme et conserve les métadonnées', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const attacks = [
      'http://www.wikitimbres.fr/public/stamps/800/ESSAI-1902-7.jpg',
      'https://exemple.invalid/public/stamps/800/ESSAI-1902-7.jpg',
      'https://www.wikitimbres.fr:8443/public/stamps/800/ESSAI-1902-7.jpg',
      'https://user:pass@www.wikitimbres.fr/public/stamps/800/ESSAI-1902-7.jpg',
      'https://www.wikitimbres.fr/public/assets/img/logo.png',
      'javascript:alert(1)',
    ];
    for (const attack of attacks) {
      const html = fixture.replaceAll('https://www.wikitimbres.fr/public/stamps/800/ESSAI-1902-7.jpg', attack);
      const row = parseStamp(html, 1, source, { images: true })!;
      expect(row.title, attack).toBe('Phare de l’Éclat — type Démo');
      expect(row.image_url, attack).toBe('');
      expect(row.image_credit, attack).toBe('');
    }
    expect(log).toHaveBeenCalledWith(expect.stringContaining('illustration'));
  });

  it('accepte une adresse relative du même site et la normalise en HTTPS absolue', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const html = fixture.replaceAll('https://www.wikitimbres.fr/public/stamps/800/ESSAI-1902-7.jpg',
      '/public/stamps/800/ESSAI-1902-7.jpg');
    expect(parseStamp(html, 1, source, { images: true })!.image_url)
      .toBe('https://www.wikitimbres.fr/public/stamps/800/ESSAI-1902-7.jpg');
  });

  it('ignore un numéro de catalogue factice affiché par le site', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const tellier = /(<span class="timInfoLabel">Tellier<\/span>\s*<span class="timInfo">)1(<\/span>)/;
    expect(tellier.test(fixture)).toBe(true);
    for (const placeholder of ['xxxxx', 'XXXX', '-', '?', 'n/a']) {
      const html = fixture.replace(tellier, `$1${placeholder}$2`);
      expect(parseStamp(html, 1, source)!.catalog_number, placeholder).toBe('');
    }
  });

  it('conserve un numéro de catalogue réellement renseigné', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(parseStamp(fixture, 1, source)!.catalog_number).toBe('1');
  });
});
