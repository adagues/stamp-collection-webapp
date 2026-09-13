import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('excludes local databases, exports, caches and HTML evidence without hiding synthetic sources', () => {
  const local = ['data/vault.sqlite', 'relatif.sqlite-wal', 'data/custom.sqlite3',
    'data/cache/other-source/page.html', 'data/import/custom.csv',
    'data/exports/embeddings.json', 'data/exports/catalog.json', 'evidence/page.html',
    'wikitimbres-evidence/notice.html', 'data/local/catalog.json', 'backups/vault.sqlite'];
  const published = ['data/catalog.json', 'data/embeddings.json', 'data/import/README.md',
    'tests/fixtures/wikitimbres-synthetic.html', 'DATA-LICENSE.md'];
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    input: [...local, ...published].join('\n') + '\n', encoding: 'utf8',
  }).trim().split('\n');
  expect(ignored.sort()).toEqual(local.sort());
});
