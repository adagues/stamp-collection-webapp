import { readFile } from 'node:fs/promises';
import { YEAR_MAX, YEAR_MIN } from './discover';
import { atomicWrite } from './fetch';
import { ORIGIN } from './policy';

export type NoticeState = 'exported' | 'rejected' | 'missing';
type Plan = {
  version: 1;
  /** Listing URL -> visited or not; a listing stays pending until its ids are recorded. */
  listings: Record<string, boolean>;
  /** Notice id -> outcome, or null while still to be fetched. */
  notices: Record<string, NoticeState | null>;
  /** Totals announced by the listings themselves, for an honest coverage report. */
  announced: Record<string, number>;
};

export type Coverage = {
  listingsDone: number; listingsPending: number;
  noticesDiscovered: number; noticesExported: number; noticesRejected: number;
  noticesMissing: number; noticesPending: number;
  announcedTotal: number | null; complete: boolean;
};

/** Everything a single listing page taught us, saved as one indivisible checkpoint. */
export type ListingResult = {
  /** Notice ids linked by the page. */
  ids: number[];
  /** Total announced by the page heading, or null when absent. */
  announced?: number | null;
  /** Further listing URLs published by the page (pagination, other years). */
  discovered?: string[];
};

/** Injectable writer so tests can simulate an interrupted save without touching real files. */
export type PlanWriter = (path: string, content: string) => Promise<void>;

const empty = (): Plan => ({ version: 1, listings: {}, notices: {}, announced: {} });

// Discovery must never wander outside the site's public stamp listings.
// The URL is also canonicalised so that /timbres/annee/2026, /timbres/annee/2026/2026 and
// a trailing slash all name the same listing and are fetched once.
export function assertListingUrl(url: string): string {
  let target: URL;
  try { target = new URL(url); } catch { throw new Error(`Adresse de listing invalide : ${url}`); }
  const match = target.pathname.match(/^\/timbres\/annee\/(\d{4})(?:\/(\d{4})(?:\/(\d{1,6}))?)?\/?$/);
  if (target.origin !== ORIGIN || target.username || target.password || target.search || target.hash || !match) {
    throw new Error(`Adresse de listing hors catalogue refusée : ${url}`);
  }
  const [, year, echoed, offset] = match;
  if (echoed !== undefined && echoed !== year) {
    throw new Error(`Adresse de listing incohérente refusée : ${url}`);
  }
  // The year also becomes a key of `announced`: keep it inside the catalogue's own bounds so a
  // saved plan can never hold a key that load() would then reject.
  if (Number(year) < YEAR_MIN || Number(year) > YEAR_MAX) {
    throw new Error(`Année de listing hors bornes du catalogue (${YEAR_MIN}-${YEAR_MAX}) : ${url}`);
  }
  const suffix = offset === undefined ? '' : `/${Number(offset)}`;
  return `${ORIGIN}/timbres/annee/${year}/${year}${suffix}`;
}

/** A notice id is stored as a plain decimal string: no leading zero, no 0, no unsafe integer. */
function validNoticeKey(id: string): boolean {
  return /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
}

/** Every listing key must already be the canonical URL that assertListingUrl would produce. */
function validListingKey(url: string): boolean {
  try { return assertListingUrl(url) === url; } catch { return false; }
}

function validYearKey(year: string): boolean {
  return /^\d{4}$/.test(year) && Number(year) >= YEAR_MIN && Number(year) <= YEAR_MAX;
}

/** Persisted, resumable discovery state: which listings remain, which notices are known. */
export class DiscoveryPlan {
  private plan: Plan = empty();
  constructor(private path: string, private write: PlanWriter = atomicWrite) {}

  async load(): Promise<void> {
    let raw: string;
    try { raw = await readFile(this.path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    let data: Plan;
    try { data = JSON.parse(raw) as Plan; }
    catch { throw new Error('Plan de découverte illisible : corrigez ou supprimez le fichier avant de reprendre.'); }
    const states: (NoticeState | null)[] = ['exported', 'rejected', 'missing', null];
    // Arrays must be refused explicitly: JSON.stringify silently drops the named properties of
    // an array, so accepting one here would erase the whole plan at the next save.
    const plainObject = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value);
    if (data?.version !== 1 || !plainObject(data.listings) || !plainObject(data.notices) || !plainObject(data.announced) ||
        Object.entries(data.listings).some(([url, done]) => typeof done !== 'boolean' || !validListingKey(url)) ||
        Object.entries(data.notices).some(([id, state]) => !validNoticeKey(id) || !states.includes(state)) ||
        Object.entries(data.announced).some(([year, total]) =>
          !validYearKey(year) || !Number.isSafeInteger(total) || total < 0)) {
      throw new Error('Plan de découverte invalide : reprise arrêtée pour ne pas perdre la couverture déjà acquise.');
    }
    this.plan = data;
  }

  /** Persist a candidate plan first; only adopt it in memory once the write succeeded. */
  private async commit(next: Plan): Promise<void> {
    await this.write(this.path, JSON.stringify(next, null, 2) + '\n');
    this.plan = next;
  }

  private clone(): Plan {
    return {
      version: 1,
      listings: { ...this.plan.listings },
      notices: { ...this.plan.notices },
      announced: { ...this.plan.announced },
    };
  }

  async addListings(urls: string[]): Promise<number> {
    const checked = urls.map(assertListingUrl);
    const next = this.clone();
    let added = 0;
    for (const url of checked) if (!Object.hasOwn(next.listings, url)) { next.listings[url] = false; added++; }
    if (added) await this.commit(next);
    return added;
  }

  nextListing(): string | undefined {
    return Object.keys(this.plan.listings).find(url => !this.plan.listings[url]);
  }

  /**
   * Record everything a listing page produced — its notice ids, its announced total and the
   * further listing URLs it published — as a single atomic checkpoint. Marking the page done
   * before saving its links used to lose the pagination and the year index on a crash.
   */
  async recordListing(url: string, result: ListingResult): Promise<{ newNotices: number; addedListings: number }> {
    const key = assertListingUrl(url);
    const discovered = (result.discovered ?? []).map(assertListingUrl);
    for (const id of result.ids) {
      if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Identifiant de notice invalide : ${id}`);
    }
    const next = this.clone();
    next.listings[key] = true;
    let addedListings = 0;
    for (const link of discovered) if (!Object.hasOwn(next.listings, link)) { next.listings[link] = false; addedListings++; }
    // Every page of a year repeats the same year total: key it by year so the coverage
    // report sums each year once instead of multiplying it by its page count.
    if (result.announced !== undefined && result.announced !== null) {
      const year = key.match(/\/timbres\/annee\/(\d{4})\//)?.[1];
      if (year) next.announced[year] = result.announced;
    }
    let newNotices = 0;
    for (const id of result.ids) {
      if (!Object.hasOwn(next.notices, String(id))) { next.notices[String(id)] = null; newNotices++; }
    }
    await this.commit(next);
    return { newNotices, addedListings };
  }

  /** Narrow form of {@link recordListing} for callers that discovered no further listing. */
  async completeListing(url: string, ids: number[], announced?: number | null): Promise<number> {
    const { newNotices } = await this.recordListing(url, { ids, announced });
    return newNotices;
  }

  pendingNotices(): number[] {
    return Object.entries(this.plan.notices).filter(([, state]) => state === null)
      .map(([id]) => Number(id)).sort((a, b) => a - b);
  }

  noticeState(id: number): NoticeState | null | undefined { return this.plan.notices[String(id)]; }

  async completeNotice(id: number, state: NoticeState): Promise<void> {
    const next = this.clone();
    next.notices[String(id)] = state;
    await this.commit(next);
  }

  /** Mark an already-exported notice as pending again, e.g. to backfill its illustration. */
  async reopenNotice(id: number): Promise<void> {
    if (!Object.hasOwn(this.plan.notices, String(id))) throw new Error(`Notice inconnue du plan : ${id}`);
    const next = this.clone();
    next.notices[String(id)] = null;
    await this.commit(next);
  }

  /**
   * Put back in the pending queue the notices previously recorded as `rejected` or `missing`,
   * at most `limit` of them, and return the ids reopened. Exported notices are never touched:
   * re-exporting them is not a retry, and blanking their row is a data loss.
   */
  async reopenRejected(limit: number): Promise<number[]> {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error(`Budget de réouverture invalide : ${limit}`);
    const targets = Object.entries(this.plan.notices)
      .filter(([, state]) => state === 'rejected' || state === 'missing')
      .map(([id]) => Number(id)).sort((a, b) => a - b).slice(0, limit);
    if (!targets.length) return [];
    const next = this.clone();
    for (const id of targets) next.notices[String(id)] = null;
    await this.commit(next);
    return targets;
  }

  coverage(): Coverage {
    const states = Object.values(this.plan.notices);
    const count = (state: NoticeState | null) => states.filter(value => value === state).length;
    const listings = Object.values(this.plan.listings);
    const announcedValues = Object.values(this.plan.announced);
    const listingsPending = listings.filter(done => !done).length;
    const noticesPending = count(null);
    return {
      listingsDone: listings.filter(Boolean).length, listingsPending,
      noticesDiscovered: states.length, noticesExported: count('exported'),
      noticesRejected: count('rejected'), noticesMissing: count('missing'), noticesPending,
      announcedTotal: announcedValues.length ? announcedValues.reduce((sum, value) => sum + value, 0) : null,
      complete: listingsPending === 0 && noticesPending === 0,
    };
  }
}
