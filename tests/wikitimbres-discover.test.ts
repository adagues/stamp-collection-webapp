import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNoticeIds, parseYearIndex, parsePaginationUrls, parseListingTotal } from '../scripts/wikitimbres/discover';

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const year1849 = read('wikitimbres-annee-1849.html');
const year2020 = read('wikitimbres-annee-2020.html');
const listing1849 = 'https://www.wikitimbres.fr/timbres/annee/1849';

// Fixtures synthétiques : identifiants, illustrations et compteurs inventés. Les valeurs
// attendues ci-dessous décrivent donc les fixtures du dépôt, pas un relevé du site.
describe('découverte des notices depuis les listings publiés, sans réseau', () => {
  it('liste les années proposées par le listing, sans plage devinée', () => {
    const years = parseYearIndex(year1849, listing1849);
    expect(years.length).toBeGreaterThan(150);
    expect(years[0]).toBe(1849);
    expect(years).toContain(2026);
    expect(years).not.toContain(1851);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(new Set(years).size).toBe(years.length);
  });

  it('extrait les identifiants de notices d’une page d’année', () => {
    const ids = parseNoticeIds(year1849, listing1849);
    expect(ids).toEqual([7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108]);
  });

  it('lit le total annoncé et suit les liens de pagination publiés', () => {
    expect(parseListingTotal(year2020)).toBe(120);
    expect(parseListingTotal(year1849)).toBe(8);
    expect(parsePaginationUrls(year2020, 'https://www.wikitimbres.fr/timbres/annee/2020')).toEqual([
      'https://www.wikitimbres.fr/timbres/annee/2020/2020/40',
      'https://www.wikitimbres.fr/timbres/annee/2020/2020/80',
      'https://www.wikitimbres.fr/timbres/annee/2020/2020/320',
    ]);
    expect(parsePaginationUrls(year1849, listing1849)).toEqual([]);
  });

  it('ne suit pas une pagination hébergée ailleurs ni un chemin fabriqué', () => {
    const html = `<div class="pagination"><ul>
      <li><a href="https://exemple.invalid/timbres/annee/2020/2020/48">2</a></li>
      <li><a href="https://www.wikitimbres.fr/administration/annee/2020/2020/48">x</a></li>
      <li><a href="https://www.wikitimbres.fr/timbres/annee/2020/2020/48">ok</a></li>
    </ul></div>`;
    expect(parsePaginationUrls(html, 'https://www.wikitimbres.fr/timbres/annee/2020'))
      .toEqual(['https://www.wikitimbres.fr/timbres/annee/2020/2020/48']);
  });

  it('ignore les liens hors catalogue, les autres hôtes et les chemins d’action', () => {
    const html = `<ul class="_stamps">
      <li class="_stamp"><a href="https://www.wikitimbres.fr/timbres/7/valide-un">x</a></li>
      <li class="_stamp"><a href="https://exemple.invalid/timbres/8/autre-site">x</a></li>
      <li class="_stamp"><a href="https://www.wikitimbres.fr/timbres/ajouter_selection">x</a></li>
      <li class="_stamp"><a href="https://www.wikitimbres.fr/co/timbres/9/colonie">x</a></li>
      <li class="_stamp"><a href="/timbres/10/relatif-accepte">x</a></li>
      <li class="_stamp"><a href="https://www.wikitimbres.fr/timbres/0/zero">x</a></li>
      <li class="_stamp"><a href="https://www.wikitimbres.fr/timbres/999999999999/trop-grand">x</a></li>
    </ul>`;
    expect(parseNoticeIds(html, listing1849)).toEqual([7, 10]);
  });
});
