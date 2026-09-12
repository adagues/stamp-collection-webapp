import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type CachedResponse, RequestGate, SitePolicy, USER_AGENT } from './policy';

export async function atomicWrite(path: string, content: string): Promise<void> {
  const temp = `${path}.tmp`;
  await writeFile(temp, content, 'utf8');
  await rename(temp, path);
}

export class PageCache {
  constructor(private directory: string, private gate: RequestGate, private force = false) {}
  async load(url: string, fresh = false): Promise<CachedResponse> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${createHash('sha256').update(url).digest('hex')}.json`);
    if (!this.force && !fresh) {
      try {
        const cached = JSON.parse(await readFile(path, 'utf8')) as CachedResponse;
        if (cached.url !== url || !Number.isInteger(cached.status) ||
            typeof cached.body !== 'string' || !cached.headers) throw new Error('Cache invalide.');
        console.log(`Cache : ${new URL(url).pathname}`);
        return cached;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return this.gate.run(async () => {
      console.log(`Téléchargement : ${new URL(url).pathname}`);
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9' },
        redirect: 'manual', signal: AbortSignal.timeout(30_000),
      });
      const headers = Object.fromEntries(response.headers);
      const textual = /^(text\/|application\/xhtml\+xml)/i.test(headers['content-type'] ?? '');
      // Never save binary image assets, even if a catalog URL unexpectedly serves one.
      let body = '';
      if (textual) body = await response.text();
      else await response.body?.cancel();
      const record = { url, status: response.status, headers, body };
      await atomicWrite(path, JSON.stringify(record));
      return record;
    });
  }
}

export async function catalogPage(url: string, policy: SitePolicy, cache: PageCache): Promise<CachedResponse | null> {
  for (let hop = 0; hop < 6; hop++) {
    // Apply current robots rules before both network access and cache reuse.
    if (!policy.allows(url)) return null;
    const response = await cache.load(url);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.headers.location) throw new Error('Redirection sans destination.');
      url = new URL(response.headers.location, url).href;
      continue;
    }
    if ([404, 410].includes(response.status)) {
      console.log(`Ignoré : notice absente (${response.status}).`);
      return null;
    }
    if (response.status !== 200) throw new Error(`HTTP ${response.status} : collecte arrêtée, sans nouvelle tentative.`);
    if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(response.headers['content-type'] ?? '')) {
      throw new Error('Réponse non HTML : collecte arrêtée.');
    }
    return response;
  }
  throw new Error('Trop de redirections : collecte arrêtée.');
}
