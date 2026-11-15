import { load } from 'cheerio';
import { artistKey, matchArtist, CATALOG_URL } from '../src/dj-catalog.js';

const knownSource = value => {try {const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'djmag.com';} catch {return false;}};
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
async function read(url, fetchImpl, deadline) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Catalog build deadline reached');
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(Math.min(30000, remaining)), headers: { 'User-Agent': 'VegasPartiesCatalogIntegration/1.0' } });
      if (!response.ok) {
        const error = new Error(`Catalog returned HTTP ${response.status}`);
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error('Catalog response too large');
      return body;
    } catch (error) {
      const transient = error.retryable || ['TypeError', 'TimeoutError', 'AbortError'].includes(error.name);
      if (attempt || !transient) throw error;
    }
  }
}
export function parseCatalogIndex(html) {
  const $ = load(html);
  const entries = [];
  $('a.card').each((_, element) => {
    const card = $(element), href = card.attr('href') || '';
    const path = /^djs\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/.exec(href);
    const edition = /^DJ Mag (\d{4})$/.exec(card.find('small').text().trim());
    const rank = Number(card.find('.rank').text().trim());
    const name = card.find('h2').text().trim();
    if (!path || !edition || !name || !Number.isInteger(rank) || rank < 1) throw new Error('Invalid catalog entry');
    entries.push({ id: path[1], name, year: Number(edition[1]), rank, detailUrl: new URL(href, CATALOG_URL).href });
  });
  if (entries.length < 100 || entries.length > 1000 || new Set(entries.map(e=>e.id)).size !== entries.length || new Set(entries.map(e=>e.rank)).size !== entries.length || new Set(entries.map(e=>e.year)).size !== 1) throw new Error('Incomplete or inconsistent catalog index');
  return entries;
}
export function verifyProfile(profile, entry, detailHtml) {
  if (profile.schema_version !== '1.0.0' || profile.id !== entry.id || artistKey(profile.name) !== artistKey(entry.name) || !date(profile.updated_at)) throw new Error('Profile identity mismatch');
  const rankings = profile.rankings;
  if (!Array.isArray(rankings) || !rankings.length || rankings.some(r => !Number.isInteger(r.year) || !Number.isInteger(r.rank) || r.rank < 1 || !knownSource(r.source_url))) throw new Error('Invalid ranking');
  const latest = rankings.filter(r => r.year === Math.max(...rankings.map(r=>r.year)));
  if (latest.length !== 1 || latest[0].year !== entry.year || latest[0].rank !== entry.rank) throw new Error('Catalog edition mismatch');
  const ranking = latest[0];
  const sources = Array.isArray(profile.sources) ? profile.sources : [];
  const evidence = field => sources.some(source => source.url === ranking.source_url && knownSource(source.url) && date(source.retrieved_at) && source.fields?.includes('/' + field));
  if (!new URL(ranking.source_url).pathname.startsWith(`/top100djs/${ranking.year}/${ranking.rank}/`)) throw new Error('Ranking source edition mismatch');
  if (!evidence('rankings')) throw new Error('No ranking provenance');
  if (artistKey(load(detailHtml)('h1').first().text()) !== artistKey(entry.name)) throw new Error('Detail page identity mismatch');
  const text = field => evidence(field) && typeof profile[field] === 'string' && profile[field].trim() ? profile[field].trim().slice(0,500) : null;
  return { id: entry.id, name: profile.name, year: ranking.year, rank: ranking.rank, sourceUrl: ranking.source_url, detailUrl: entry.detailUrl, observedAt: profile.updated_at,
    description: text('description'), origin: text('origin'), bestKnownFor: text('best_known_for'), styles: evidence('styles') && Array.isArray(profile.styles) ? profile.styles.filter(x=>typeof x==='string').map(x=>x.slice(0,100)).slice(0,8) : [] };
}
export async function loadDJCatalog(menu, { fetchImpl = fetch, now = new Date() } = {}) {
  const result = { schemaVersion: 1, catalogUrl: CATALOG_URL, checkedAt: now.toISOString(), status: 'unavailable', year: null, catalogCount: 0, matchedListingCount: 0, failedProfiles: 0, profiles: [] };
  const deadline = Date.now() + 120000;
  try {
    const entries = parseCatalogIndex(await read(CATALOG_URL, fetchImpl, deadline));
    result.year = entries[0].year; result.catalogCount = entries.length;
    const selected = [...new Map(menu.events.map(event=>matchArtist(event.description,entries)).filter(Boolean).map(entry=>[entry.id,entry])).values()];
    // Only matching artists are read; this does not crawl DJ Mag or launch another collection schedule.
    const results = new Map();
    const queue = [...selected];
    const worker = async () => {
      while (queue.length) {
        const entry = queue.shift();
        try {
          const [json, detail] = await Promise.all([read(new URL(`data/djs/${entry.id}.json`, CATALOG_URL).href, fetchImpl, deadline), read(entry.detailUrl, fetchImpl, deadline)]);
          results.set(entry.id, verifyProfile(JSON.parse(json),entry,detail));
        } catch { result.failedProfiles++; }
      }
    };
    await Promise.all(Array.from({length: Math.min(4, selected.length)}, worker));
    result.profiles = selected.map(entry => results.get(entry.id)).filter(Boolean);
    result.matchedListingCount = menu.events.filter(event=>matchArtist(event.description,result.profiles)).length;
    result.status = result.failedProfiles ? 'partial' : 'ok';
  } catch { /* Preserve the complete menu even when the optional catalog is unavailable. */ }
  return result;
}
