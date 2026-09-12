import { DomUtils, parseDocument } from 'htmlparser2';

export const FIELDS = ['id', 'title', 'country', 'year', 'series', 'denomination', 'description',
  'image_url', 'image_credit', 'source_url', 'catalog_number', 'estimated_value', 'currency'] as const;
export type CatalogRow = Record<(typeof FIELDS)[number], string>;
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const key = (value: string) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[’‘]/g, "'").replace(/\s*[:：]\s*$/, '');

// Keep the CSV schema stable; expose color separately for parser consumers.
export function parseStamp(html: string, id: number, source: string): (CatalogRow & { color: string }) | null {
  const document = parseDocument(html);
  for (const node of DomUtils.findAll(node => ['script', 'style', 'nav', 'footer', 'aside'].includes(node.name), document.children)) {
    DomUtils.removeElement(node);
  }
  const elements = DomUtils.findAll(() => true, document.children);
  const hasClass = (node: (typeof elements)[number], name: string) =>
    (node.attribs.class ?? '').split(/\s+/).includes(name);
  const facts = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const skip = (reason: string) => {
    console.log(`Notice ${id} ignorée : ${reason}.`);
    return null;
  };
  const add = (label: string, value: string) => {
    const normalized = key(label), text = clean(value);
    if (normalized && normalized.length < 80 && text && text.length <= 2000 && !facts.has(normalized)) {
      facts.set(normalized, text);
    }
  };
  // Real pages pair classed labels and values, with optional intervening markup.
  for (const node of elements.filter(node => hasClass(node, 'timInfoLabel') || hasClass(node, 'timInfoLabel2'))) {
    const extended = hasClass(node, 'timInfoLabel2');
    const value = DomUtils.findAll(child => hasClass(child, extended ? 'timInfo2' : 'timInfo'),
      node.parent ? DomUtils.getChildren(node.parent) : [])[0];
    if (!value) continue;
    const label = DomUtils.textContent(node);
    if (extended) descriptions.set(key(label), clean(DomUtils.textContent(value)));
    else add(label, DomUtils.textContent(value));
  }
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
  const title = (get('Nom', 'Titre') || clean(heading ? DomUtils.textContent(heading) : ''))
    .replace(/^Timbre\s*:\s*/i, '');
  let country = get('Pays', "Pays d'émission");
  const breadcrumb = elements.find(node => hasClass(node, 'breadcrumb'));
  if (!country && breadcrumb) {
    const links = DomUtils.findAll(node => node.name === 'a', breadcrumb.children);
    const location = links.find(node => /\/(?:pays|colonies?|territoires?)\//i.test(node.attribs.href ?? ''));
    const labeled = clean(DomUtils.textContent(breadcrumb)).match(/(?:Pays|Colonie|Territoire)\s*:\s*([^>]+)/i);
    country = clean(labeled?.[1] ?? (location ? DomUtils.textContent(location) : ''));
  }
  if (!country && /^\/timbres\//.test(new URL(source).pathname)) {
    country = 'France';
    console.log(`Notice ${id} : pays non précisé ou fil d’Ariane ambigu ; France retenue par défaut.`);
  }
  const date = get('Émission', "Date d'émission", 'Date de vente générale', "Année d'émission", 'Année');
  const year = date.match(/\b(?:18[4-9]\d|19\d{2}|20\d{2}|2100)\b/)?.[0] ?? '';
  if (!title || title.length > 2000) return skip('titre absent ou trop long');
  if (!country) return skip('pays indéterminé');
  if (!year) return skip('année d’émission absente ou invalide');
  const series = get('Groupe', 'Série') || 'Série non renseignée';
  const denomination = get('Valeur', 'Valeur faciale', 'Faciale');
  const color = get('Couleur', 'Couleurs');
  const theme = get('Thème', 'Thématique');
  // No guessed catalog reference or market valuation; retain a labeled reference verbatim.
  const catalog = get('Tellier', 'N° Y&T', 'Yvert et Tellier', 'Yvert & Tellier');
  const description = descriptions.get('description') || descriptions.get('commentaire') ||
    [`Pays : ${country}`, `Année : ${year}`, denomination && `Valeur faciale : ${denomination}`,
      color && `Couleur : ${color}`, get('Groupe', 'Série') && `Groupe : ${series}`,
      theme && `Thème : ${theme}`].filter(Boolean).join(' ; ');
  if (description.length > 2000) return skip('description trop longue');
  return { id: `wikitimbres-${id}`, title, country, year, series, denomination, color, description,
    image_url: '', image_credit: '', source_url: source, catalog_number: catalog,
    estimated_value: '', currency: 'EUR' };
}
