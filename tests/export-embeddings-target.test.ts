import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// L'export d'empreintes est un artefact LOCAL : il ne doit jamais réécrire le fichier de
// démonstration suivi par Git, sous peine de republier accidentellement des vecteurs
// calculés depuis des images tierces. Destination par défaut : data/exports/ (ignoré).
// Les tests écrivent dans un dossier temporaire : ils ne déposent rien dans le dépôt.
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
const distributed = new URL('../data/embeddings.json', import.meta.url);

describe('export local des empreintes', () => {
  it('écrit hors du fichier de démonstration suivi par Git', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coffre-export-'));
    directories.push(directory);
    const output = join(directory, 'embeddings.json');
    const before = readFileSync(distributed, 'utf8');
    const result = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/export-embeddings.ts'], {
      cwd: process.cwd(), encoding: 'utf8',
      env: { ...process.env, TURSO_DATABASE_URL: `file:${join(directory, 'export.sqlite')}`, EMBEDDINGS_OUTPUT: output },
    });
    expect(result).toMatch(/embeddings\.json/);
    expect(readFileSync(distributed, 'utf8')).toBe(before);
    expect(existsSync(output)).toBe(true);
  });

  it('range l’export par défaut dans un chemin exclu de la publication', () => {
    const ignored = execFileSync('git', ['check-ignore', '--no-index', 'data/exports/embeddings.json'], {
      cwd: process.cwd(), encoding: 'utf8',
    }).trim();
    expect(ignored).toBe('data/exports/embeddings.json');
  });

  it('ne cible jamais le fichier de démonstration, même sans variable d’environnement', () => {
    const source = readFileSync(new URL('../scripts/export-embeddings.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/writeFileSync\(\s*['"]data\/embeddings\.json['"]/);
    expect(source).toMatch(/'exports'/);
  });
});
