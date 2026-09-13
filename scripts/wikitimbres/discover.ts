import { DomUtils, parseDocument } from 'htmlparser2';
import { ORIGIN } from './policy';

/**
 * Discovery reads only the site's own public listings (year index + `/timbres/annee/...`
 * pages) instead of guessing an identifier range, so coverage can be reported honestly.
 * The site exposes no usable sitemap.xml (verified empty, see docs/05-scraping.md).
 */
export const YEAR_MIN = 1840;
export const YEAR_MAX = 2100;

function absolute(href: string, base: string): URL | null {
  try {
    const url = new URL(href, base);
    return url.origin === ORIGIN && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function links(html: string, base: string): URL[] {
  const document = parseDocument(html);
  return DomUtils.findAll(node => node.name === 'a', document.children)
    .map(node => absolute(node.attribs.href ?? '', base))
    .filter((url): url is URL => url !== null);
}

/** Years advertised by the site's own year navigation, ascending and deduplicated. */
export function parseYearIndex(html: string, base: string): number[] {
  const years = new Set<number>();
  for (const url of links(html, base)) {
    const match = url.pathname.match(/^\/timbres\/annee\/(\d{4})(?:\/\d{4})?\/?$/);
    const year = Number(match?.[1]);
    if (match && year >= YEAR_MIN && year <= YEAR_MAX) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

/** Notice identifiers linked by a listing page: `/timbres/<id>/<slug>` only. */
export function parseNoticeIds(html: string, base: string): number[] {
  const ids = new Set<number>();
  for (const url of links(html, base)) {
    const match = url.pathname.match(/^\/timbres\/(\d{1,7})\/[a-z0-9][a-z0-9-]*\/?$/i);
    const id = Number(match?.[1]);
    if (match && Number.isSafeInteger(id) && id >= 1) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Total announced in the listing heading, e.g. « Année : 2020 (399 Timbres) ». */
export function parseListingTotal(html: string): number | null {
  const document = parseDocument(html);
  const heading = DomUtils.findAll(node => (node.attribs?.class ?? '').split(/\s+/).includes('mx-title'), document.children)[0];
  const text = heading ? DomUtils.textContent(heading).replace(/\s+/g, ' ') : '';
  const match = text.match(/\((\d{1,6})\s*[Tt]imbres?\)/);
  return match ? Number(match[1]) : null;
}

/**
 * Pagination URLs exactly as published by the listing (never rebuilt from an offset:
 * the site's own pagination uses /timbres/annee/<year>/<year>/<offset>, and guessing
 * the shape produced a wrong URL in a live trial).
 */
export function parsePaginationUrls(html: string, base: string): string[] {
  const urls = new Map<number, string>();
  for (const url of links(html, base)) {
    const match = url.pathname.match(/^\/timbres\/annee\/\d{4}\/\d{4}\/(\d{1,6})\/?$/);
    const offset = Number(match?.[1]);
    if (match && offset > 0 && !url.search && !url.hash) urls.set(offset, url.href);
  }
  return [...urls.entries()].sort(([a], [b]) => a - b).map(([, href]) => href);
}

/** Site-wide count shown in the top bar (« Déjà N timbres répertoriés »), for honest reporting. */
export function parseSiteTotal(html: string): number | null {
  const document = parseDocument(html);
  const banner = DomUtils.findAll(node => (node.attribs?.class ?? '').split(/\s+/).includes('hStampAmount'), document.children)[0];
  const text = banner ? DomUtils.textContent(banner).replace(/\s+/g, ' ') : '';
  const match = text.match(/Déjà\s*(\d{1,7})\s*timbres/i);
  return match ? Number(match[1]) : null;
}
