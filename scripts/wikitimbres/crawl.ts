import { ORIGIN } from './policy';
import type { CachedResponse } from './policy';
import { parseListingTotal, parseNoticeIds, parsePaginationUrls, parseSiteTotal, parseYearIndex } from './discover';
import { YEAR_MAX, YEAR_MIN } from './discover';
import { parseStamp } from './parse';
import type { DiscoveryPlan, NoticeState } from './discovery-plan';
import type { CatalogStore } from './store';

/** How a listing page is fetched; injected so the step can be tested without any network. */
export type ListingLoader = (url: string) => Promise<CachedResponse | null>;

export type ListingOutcome = {
  /** Number of notice ids linked by the page. */
  ids: number;
  /** New notice ids added to the plan by this page. */
  newNotices: number;
  /** New listing URLs (pagination + years) added to the plan by this page. */
  addedListings: number;
  /** Total announced by the page heading, or null. */
  announced: number | null;
  /** Site-wide total shown in the banner, or null. */
  siteTotal: number | null;
};

/**
 * Read one listing page and record everything it taught us in a single atomic checkpoint:
 * notice ids, announced total, published pagination and the year index.
 *
 * Marking the page done before saving its links would lose the pagination and the years if the
 * run died in between — the plan would then claim the page was handled while its links are gone.
 */
export async function readListing(url: string, plan: DiscoveryPlan, load: ListingLoader): Promise<ListingOutcome> {
  const response = await load(url);
  if (!response) {
    // The page is gone or forbidden: mark it handled so the plan does not loop on it, and add
    // nothing — no invented link, no invented total.
    const { newNotices, addedListings } = await plan.recordListing(url, { ids: [], announced: null });
    return { ids: 0, newNotices, addedListings, announced: null, siteTotal: null };
  }
  const ids = parseNoticeIds(response.body, response.url);
  const announced = parseListingTotal(response.body);
  const siteTotal = parseSiteTotal(response.body);
  const pagination = parsePaginationUrls(response.body, response.url);
  const years = parseYearIndex(response.body, response.url)
    .filter(year => year >= YEAR_MIN && year <= YEAR_MAX)
    .map(year => `${ORIGIN}/timbres/annee/${year}/${year}`);
  const { newNotices, addedListings } = await plan.recordListing(url, {
    ids, announced, discovered: [...pagination, ...years],
  });
  return { ids: ids.length, newNotices, addedListings, announced, siteTotal };
}

export type NoticeOptions = {
  /** Extract the illustration URL as well. */
  images: boolean;
  /** Renew cached responses and reprocess notices already exported. */
  force: boolean;
  /** This notice is deliberately being re-examined (backfill), so read its page even without --force. */
  revisit?: boolean;
};
export type NoticeOutcome = {
  /** Final state recorded in the plan for this notice. */
  state: NoticeState;
  /** Whether the notice page was actually requested (cache or network). */
  fetched: boolean;
  /** Whether a row was written to the catalog store. */
  saved: boolean;
};

/**
 * Visit one pending notice and record its outcome in the plan.
 *
 * A notice already present in the manifest — typically exported by an earlier range run that the
 * plan never saw — is NOT re-parsed: re-parsing it without `--images` would produce an empty
 * `image_url` and erase an illustration collected earlier. The plan is simply synchronised from
 * the manifest so the notice stops being pending. `--force` still allows a real revisit, and the
 * store then preserves the known illustration on its own.
 */
export async function visitNotice(
  id: number, plan: DiscoveryPlan, store: CatalogStore, load: ListingLoader, options: NoticeOptions,
): Promise<NoticeOutcome> {
  if (store.has(id) && !options.force && !options.revisit) {
    console.log('Déjà exportée : plan synchronisé depuis le manifeste, notice non redemandée.');
    await plan.completeNotice(id, 'exported');
    return { state: 'exported', fetched: false, saved: false };
  }
  const response = await load(`${ORIGIN}/timbres/${id}`);
  if (!response) {
    await plan.completeNotice(id, 'missing');
    return { state: 'missing', fetched: true, saved: false };
  }
  const row = parseStamp(response.body, id, response.url, { images: options.images });
  if (!row) {
    console.log('Ignorée : métadonnées obligatoires absentes ou format HTML non reconnu.');
    await plan.completeNotice(id, 'rejected');
    return { state: 'rejected', fetched: true, saved: false };
  }
  await store.save(id, row);
  await plan.completeNotice(id, 'exported');
  return { state: 'exported', fetched: true, saved: true };
}
