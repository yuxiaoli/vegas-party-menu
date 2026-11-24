import { load } from 'cheerio';
import { CATALOG_URL, catalogDetailUrl } from '../src/djmag-links.js';
import { VENUE_INDEX_URL, reviewedVenue, venueKey } from '../src/venue-catalog.js';

const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
async function read(url, fetchImpl, deadline) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Venue catalog deadline reached');
    try {
      const response = await fetchImpl(url, {signal: AbortSignal.timeout(Math.min(30000, remaining)), redirect: 'error'});
      if (!response.ok) {
        const error = new Error(`Venue catalog HTTP ${response.status}`);
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error('Venue catalog response too large');
      return body;
    } catch (error) {
      if (attempt || !(error.retryable || ['TypeError', 'TimeoutError', 'AbortError'].includes(error.name))) throw error;
    }
  }
}

export function parseVenueIndex(value) {
  const entries = value?.venues;
  if (!Array.isArray(entries) || !entries.length || entries.length > 1000 || new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Invalid venue index');
  for (const entry of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || typeof entry.name !== 'string' || !entry.name.trim() || !['dayclub','nightclub'].includes(entry.type) || entry.detail_url !== `venues/${entry.id}.html` || entry.json_url !== `data/venues/${entry.id}.json`) throw new Error('Invalid venue entry');
  }
  return entries;
}

export function verifyVenue(profile, entry, alias, detailHtml) {
  if (entry.id !== alias.id || venueKey(entry.name) !== venueKey(alias.name) || entry.type !== alias.type || profile.id !== alias.id || venueKey(profile.name) !== venueKey(alias.name) || profile.listing_category !== alias.type || venueKey(profile.facts?.location) !== venueKey(alias.location)) throw new Error('Venue identity mismatch');
  const source = profile.source;
  const locationEvidence = profile.field_provenance?.location;
  if (source?.url !== alias.sourceUrl || !validDate(source.observed_at) || locationEvidence?.source_url !== source.url || !validDate(locationEvidence.retrieved_at)) throw new Error('Missing venue identity provenance');
  if (venueKey(load(detailHtml)('h1').first().text()) !== venueKey(alias.name)) throw new Error('Venue detail identity mismatch');
  return {id: alias.id, name: profile.name, type: alias.type, location: profile.facts.location, detailUrl: new URL(entry.detail_url, CATALOG_URL).href, sourceUrl: source.url, observedAt: source.observed_at};
}

async function verifyChineseVenue(record, canonicalHtml, fetchImpl, deadline) {
  const expectedUrl = catalogDetailUrl('venues', record.id, 'zh-CN');
  const $ = load(canonicalHtml);
  const advertised = $('a[hreflang="zh-CN"][href], link[rel="alternate"][hreflang="zh-CN"][href]').toArray().some(link => {
    const href = $(link).attr('href');
    return URL.canParse(href, record.detailUrl) && new URL(href, record.detailUrl).href === expectedUrl;
  });
  if (!advertised) return;

  try {
    const page = load(await read(expectedUrl, fetchImpl, deadline));
    if (page('html').attr('lang') === 'zh-CN' && venueKey(page('h1').first().text()) === venueKey(record.name)) {
      record.detailUrls = { 'zh-CN': expectedUrl };
    }
  } catch {
    // The original venue match remains available for the English menu.
  }
}

export async function loadVenueCatalog(menu, {fetchImpl = fetch, now = new Date()} = {}) {
  const result = {schemaVersion: 1, indexUrl: VENUE_INDEX_URL, checkedAt: now.toISOString(), status: 'unavailable', catalogCount: 0, matchedListingCount: 0, failedVenues: 0, venues: []};
  const deadline = Date.now() + 120000;
  try {
    const entries = parseVenueIndex(JSON.parse(await read(VENUE_INDEX_URL, fetchImpl, deadline)));
    result.catalogCount = entries.length;
    const selected = [...new Map(menu.events.map(event => reviewedVenue(event.venue)).filter(Boolean).map(alias => [alias.id, alias])).values()];
    const queue = [...selected], verified = new Map();
    const worker = async () => {
      while (queue.length) {
        const alias = queue.shift();
        try {
          const entry = entries.find(item => item.id === alias.id);
          if (!entry || venueKey(entry.name) !== venueKey(alias.name) || entry.type !== alias.type) throw new Error('Reviewed venue absent or changed');
          // Read only selected published records. Never crawl the external venue source.
          const [json, html] = await Promise.all([read(new URL(entry.json_url, CATALOG_URL).href, fetchImpl, deadline), read(new URL(entry.detail_url, CATALOG_URL).href, fetchImpl, deadline)]);
          const record = verifyVenue(JSON.parse(json), entry, alias, html);
          await verifyChineseVenue(record, html, fetchImpl, deadline);
          verified.set(alias.id, record);
        } catch { result.failedVenues++; }
      }
    };
    await Promise.all(Array.from({length: Math.min(4, selected.length)}, worker));
    result.venues = selected.map(alias => verified.get(alias.id)).filter(Boolean);
    result.matchedListingCount = menu.events.filter(event => verified.has(reviewedVenue(event.venue)?.id)).length;
    result.status = result.failedVenues ? 'partial' : 'ok';
  } catch { /* Optional links must never remove or replace any original menu event. */ }
  return result;
}
