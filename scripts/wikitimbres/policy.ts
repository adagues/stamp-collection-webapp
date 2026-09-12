import robotsParser from 'robots-parser';
import { setTimeout as sleep } from 'node:timers/promises';

export const ORIGIN = 'https://www.wikitimbres.fr';
export const USER_AGENT = 'StampVaultBot/1.0 (personal catalog research; metadata only)';
export const ROBOTS_URL = `${ORIGIN}/robots.txt`;
export type CachedResponse = { url: string; status: number; headers: Record<string, string>; body: string };
export type Loader = (url: string) => Promise<CachedResponse>;

export function configuredDelay(value = process.env.WIKITIMBRES_DELAY_MS): number {
  const delay = value === undefined ? 3000 : Number(value);
  if (!Number.isFinite(delay) || delay < 3000 || delay > 3_600_000) {
    throw new Error('WIKITIMBRES_DELAY_MS doit être compris entre 3000 et 3600000.');
  }
  return delay;
}

// Serialize requests, including redirects and robots.txt; never retry automatically.
export class RequestGate {
  private tail: Promise<unknown> = Promise.resolve();
  private lastFinished = 0;
  constructor(public delay = configuredDelay()) {}
  run<T>(request: () => Promise<T>): Promise<T> {
    const job = this.tail.then(async () => {
      await sleep(Math.max(0, this.lastFinished + this.delay - Date.now()));
      try { return await request(); } finally { this.lastFinished = Date.now(); }
    });
    this.tail = job.catch(() => undefined);
    return job;
  }
}

export class SitePolicy {
  private rules: ReturnType<typeof robotsParser>;
  private constructor(body: string, gate: RequestGate) {
    this.rules = robotsParser(ROBOTS_URL, body);
    const seconds = this.rules.getCrawlDelay(USER_AGENT);
    if (seconds !== undefined) {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds * 1000 > 3_600_000) {
        throw new Error('Délai robots non pris en charge ; collecte arrêtée.');
      }
      gate.delay = Math.max(gate.delay, seconds * 1000);
    }
  }
  static async load(load: Loader, gate: RequestGate): Promise<SitePolicy> {
    // robots.txt is the only bootstrap request; redirects are deliberately refused.
    const response = await load(ROBOTS_URL);
    if (response.status !== 200 || /<\s*(?:!doctype|html)\b/i.test(response.body) ||
        (response.body.trim() && !/^\s*user-agent\s*:/im.test(response.body))) {
      throw new Error('robots.txt inaccessible ou invalide ; aucune notice ne sera demandée.');
    }
    return new SitePolicy(response.body, gate);
  }
  allows(url: string): boolean {
    const target = new URL(url);
    if (target.origin !== ORIGIN || target.username || target.password ||
        !/^\/timbres?\//.test(target.pathname)) {
      console.log(`Ignoré : chemin hors catalogue autorisé (${target.pathname}).`);
      return false;
    }
    if (this.rules.isAllowed(url, USER_AGENT) !== true) {
      console.log(`Ignoré : robots.txt interdit ${target.pathname}.`);
      return false;
    }
    return true;
  }
}
