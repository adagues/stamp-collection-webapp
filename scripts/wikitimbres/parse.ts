import { DomUtils, parseDocument } from 'htmlparser2';

export const FIELDS = ['id', 'title', 'country', 'year', 'series', 'denomination', 'description',
  'image_url', 'image_credit', 'source_url', 'catalog_number', 'estimated_value', 'currency'] as const;
export type CatalogRow = Record<(typeof FIELDS)[number], string>;
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const key = (value: string) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\s*[:：]\s*$/, '');

// Extract only labeled facts. Do not copy editorial descriptions, biographies or credits.
export function parseStamp(html: string, id: number, source: string): CatalogRow | null {
  const document = parseDocument(html);
  for (const node of DomUtils.findAll(node => ['script', 'style', 'nav', 'footer', 'aside'].includes(node.name), document.children)) {
    DomUtils.removeElement(node);
  }
  const elements = DomUtils.findAll(() => true, document.children);
  const facts = new Map<string, string>();
  const add = (label: string, value: string) => {
    const normalized = key(label), text = clean(value);
    if (normalized && normalized.length < 80 && text && text.length <= 2000 && !facts.has(normalized)) {
      facts.set(normalized, text);
    }
  };
  for (const node of elements) {
    const children = DomUtils.findAll(() => true, DomUtils.getChildren(node)).filter(child => child.parent === node);
    if (node.name === 'tr' && children.length === 2) {
      add(DomUtils.textContent(children[0]), DomUtils.textContent(children[1]));
    }
    if (['dt', 'label'].includes(node.name)) {
      const next = DomUtils.nextElementSibling(node);
      if (next) add(DomUtils.textContent(node), DomUtils.textContent(next));
    }
    if (['li', 'p', 'div'].includes(node.name) && !children.some(child => ['div', 'p', 'ul', 'table'].includes(child.name))) {
      const text = clean(DomUtils.textContent(node));
      const separator = text.indexOf(':');
      if (separator > 0) add(text.slice(0, separator), text.slice(separator + 1));
      else if (children.length === 2) add(DomUtils.textContent(children[0]), DomUtils.textContent(children[1]));
    }
  }
  const get = (...labels: string[]) => labels.map(label => facts.get(key(label))).find(Boolean) ?? '';
  const heading = elements.find(node => node.name === 'h1');
  const title = get('Nom', 'Titre') || clean(heading ? DomUtils.textContent(heading) : '');
  const country = get('Pays', "Pays d'émission");
  const date = get('Année', "Année d'émission", "Date d'émission", 'Date de vente générale', 'Émission');
  const year = date.match(/\b(?:18[4-9]\d|19\d{2}|20\d{2}|2100)\b/)?.[0] ?? '';
  if (!title || title.length > 2000 || !country || !year) return null;
  const series = get('Série') || 'Série non renseignée';
  const denomination = get('Valeur faciale', 'Faciale');
  const color = get('Couleur', 'Couleurs');
  const theme = get('Thème', 'Thématique');
  // No guessed catalog reference or market valuation; retain a labeled reference verbatim.
  const catalog = get('N° Y&T', 'Yvert et Tellier', 'Yvert & Tellier', 'Référence catalogue', 'N° catalogue');
  const description = [`Pays : ${country}`, `Année : ${year}`, denomination && `Valeur faciale : ${denomination}`,
    color && `Couleur : ${color}`, theme && `Thème : ${theme}`].filter(Boolean).join(' ; ');
  if (description.length > 2000) return null;
  return { id: `wikitimbres-${id}`, title, country, year, series, denomination, description,
    image_url: '', image_credit: '', source_url: source, catalog_number: catalog,
    estimated_value: '', currency: 'EUR' };
}
