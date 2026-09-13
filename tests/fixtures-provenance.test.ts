import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Le dépôt ne publie aucune page copiée verbatim d'un site tiers, même comme fixture de test.
// Chaque fixture est écrite à la main et doit annoncer en tête son caractère synthétique ou
// structurel non verbatim, afin qu'une relecture n'ait pas à comparer avec la page d'origine.
const directory = new URL('./fixtures/', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.html'));
const PROVENANCE = /synth|invent|fictif|fictive|non verbatim|structurelle/i;

describe('fixtures HTML du dépôt', () => {
  it('ne contient plus la page réelle aspirée, sous quelque nom que ce soit', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).not.toContain('wikitimbres-real.html');
    for (const name of files) {
      expect(name, name).not.toMatch(/-real\.html$/);
      expect(statSync(new URL(name, directory)).size, name).toBeLessThan(30_000);
    }
  });

  it('publie la fixture de notice sous le nom canonique cité par la documentation', () => {
    expect(files).toContain('wikitimbres-synthetic.html');
  });

  it('déclare une origine synthétique ou structurelle en tête de chaque fixture', () => {
    for (const name of files) {
      const head = readFileSync(new URL(name, directory), 'utf8').slice(0, 500);
      expect(head, name).toMatch(PROVENANCE);
    }
  });

  // Une fixture « structurelle » copiée d'une page réelle garde tout de même des faits pris au
  // site : identifiants de notices, noms de fichiers d'illustrations et compteurs. Les tests
  // n'ont besoin que de la FORME de ces valeurs, donc elles sont inventées et la fixture ne
  // renvoie plus à une archive locale de la page d'origine.
  it('n’emprunte au site tiers ni identifiants de notices, ni noms d’illustrations, ni compteurs', () => {
    for (const name of files) {
      const body = readFileSync(new URL(name, directory), 'utf8');
      expect(body, name).not.toMatch(/POSTE-\d{4}-\d+/);
      expect(body, name).not.toContain('16444');
      expect(body, name).not.toMatch(/evidence/i);
      expect(body, name).not.toMatch(/page réelle|pages réelles|constaté le/i);
    }
  });

  it('n’annonce jamais une fixture comme relevée sur le site, seulement comme inventée', () => {
    for (const name of files) {
      const head = readFileSync(new URL(name, directory), 'utf8').slice(0, 700);
      expect(head, name).toMatch(/invent|fictif|fictive|synth/i);
    }
  });
});
