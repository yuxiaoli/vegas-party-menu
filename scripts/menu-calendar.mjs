import { load } from 'cheerio';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseMenu, SOURCE_URL } from './menu-source.mjs';
import { lasVegasDate, weekRange, isRetainedEvent } from '../src/calendar-filters.js';

export const INDEX_URL = 'https://halfsaintvegas.com/pages/upcoming-events';
export const PROVISIONAL_NOTICE = 'Artists and guest-list details are provisional and confirmed by the source in the week of the event.';
const DAY_MS = 86400000;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const normal = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const allowedPath = /^\/pages\/(?:this-weeks-party-menu|we-\d{1,2}-\d{1,2}-\d{2,4}-party-menu(?:-[a-z0-9-]+)?)\/?$/;

function isoWeek(text) {
  const m = text.match(/(?:Week Ending|^WE)\s+(\d{1,2})-(\d{1,2})-(\d{2,4})/i);
  if (!m) return null;
  const y = Number(m[3]) + (m[3].length === 2 ? 2000 : 0), month = Number(m[1]), d = Number(m[2]);
  const dt = new Date(Date.UTC(y, month - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

export function discoverMenus(html, baseUrl) {
  const $ = load(html), root = $('.PageContent.Rte').first();
  if (!root.length) throw new Error(`Missing source content: ${baseUrl}`);
  return root.find('a[href]').toArray().flatMap(a => {
    const label = normal($(a).text());
    if (!/^Week Ending\b/i.test(label)) return [];
    const weekEnding = isoWeek(label);
    if (!weekEnding) throw new Error(`Invalid menu week label: ${label}`);
    const url = new URL($(a).attr('href'), baseUrl);
    if (url.origin !== new URL(SOURCE_URL).origin || !allowedPath.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error(`Disallowed menu URL: ${url.origin}${url.pathname}`);
    return [{ sourceUrl: url.href.replace(/\/$/, ''), weekEnding, label }];
  });
}

export function resolveEventDate(dateText, weekEnding) {
  const base = { eventDate: null, dateStatus: 'recurring', dateWarnings: [] };
  const m = dateText.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+(\d{1,2})\/(\d{1,2})$/i);
  if (!m) return /\d/.test(dateText) ? { ...base, dateStatus: 'unresolved', dateWarnings: ['Unrecognized explicit date'] } : base;
  if (!weekEnding) return { ...base, dateStatus: 'unresolved', dateWarnings: ['Missing verified source week'] };
  const end = new Date(`${weekEnding}T00:00:00Z`), candidates = [];
  for (const y of [end.getUTCFullYear() - 1, end.getUTCFullYear(), end.getUTCFullYear() + 1]) {
    const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[3])));
    if (d.getUTCFullYear() === y && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) && Math.abs(d - end) <= 14 * DAY_MS) candidates.push(d);
  }
  if (candidates.length !== 1) return { ...base, dateStatus: 'unresolved', dateWarnings: ['Invalid or ambiguous date near source week'] };
  const d = candidates[0];
  if (DAYS[d.getUTCDay()].toLowerCase() !== m[1].toLowerCase()) return { ...base, dateStatus: 'unresolved', dateWarnings: ['Weekday does not match explicit calendar date'] };
  const delta = (end - d) / DAY_MS;
  return { eventDate: d.toISOString().slice(0, 10), dateStatus: 'dated', dateWarnings: delta < 0 || delta > 6 ? ['Explicit event date is outside the advertised week-ending window'] : [] };
}

export function buildCalendar(menus, fetchedAt) {
  const unique = new Map(), warnings = [];
  for (const menu of menus) {
    for (const event of menu.events) {
      const date = resolveEventDate(event.dateText, menu.weekEnding);
      const dateBasis = { weekEnding: menu.weekEnding, sourceUrl: menu.sourceUrl, title: menu.sourceTitle, linkLabel: menu.linkLabel };
      const provenance = { sourceUrl: menu.sourceUrl, fetchedAt: menu.fetchedAt, weekEnding: menu.weekEnding, isCurrent: menu.isCurrent, dateText: event.dateText, dateBasis, dateWarnings: date.dateWarnings };
      // Exact fields preserve conflicting terms. Undated rows remain week-scoped.
      const key = JSON.stringify([date.eventDate || menu.weekEnding, event.section, event.venue, event.details, date.eventDate ? null : event.dateText, event.description].map(normal));
      for (const warning of date.dateWarnings) warnings.push({ sourceUrl: menu.sourceUrl, dateText: event.dateText, description: event.description, message: warning });
      if (unique.has(key)) {
        const record = unique.get(key);
        record.sources.push(provenance);
        if (menu.isCurrent) { record.sourceKind = 'current'; record.sourceUrl = menu.sourceUrl; record.provisional = false; record.provisionalNotice = null; }
        continue;
      }
      unique.set(key, { ...event, id: createHash('sha256').update(key).digest('hex').slice(0, 24), ...date, weekEnding: menu.weekEnding, sourceUrl: menu.sourceUrl, sources: [provenance], dateBasis, sourceKind: menu.isCurrent ? 'current' : 'future', provisional: !menu.isCurrent, provisionalNotice: menu.isCurrent ? null : PROVISIONAL_NOTICE });
    }
  }
  return { schemaVersion: 1, timeZone: 'America/Los_Angeles', fetchedAt, menus, events: [...unique.values()], warnings };
}

// Prune persisted raw menu event rows as well as the search index. Source labels,
// fetch timestamps and original wording remain unchanged for retained rows.
export function retainCalendar(calendar, now = new Date()) {
  const weekStart = weekRange(lasVegasDate(now)).start;
  const eventBlock = /^((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s*-\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))?(?:,?\s+\d{1,2}\/\d{1,2})?)\s*[–—-]\s*(.+)$/i;
  const menus = calendar.menus.flatMap(menu => {
    const events = menu.events.filter(event => isRetainedEvent({ ...resolveEventDate(event.dateText, menu.weekEnding), weekEnding: menu.weekEnding }, now));
    if (!events.length) return [];
    const keptRows = new Set(events.map(event => JSON.stringify([normal(event.dateText), normal(event.description)])));
    const sections = menu.sections.map(section => ({ ...section, blocks: section.blocks.filter(block => {
      if (!/^(Dayclubs|Nightclubs|After Parties)$/i.test(section.title)) return true;
      const match = block.match(eventBlock);
      return !match || keptRows.has(JSON.stringify([normal(match[1]), normal(match[2])]));
    }) }));
    return [{ ...menu, events, sections }];
  });
  const retained = buildCalendar(menus, calendar.fetchedAt);
  if (!retained.events.length) throw new Error('No current-week or future events remain after validation');
  return { ...calendar, ...retained, retention: { timeZone: 'America/Los_Angeles', weekStart, retiredEventCount: calendar.events.length - retained.events.length } };
}

export async function syncCalendar({ path = 'data/calendar.json', fetchImpl = fetch, now = () => new Date(), onCurrentMenu } = {}) {
  const timestamp = () => new Date(typeof now === 'function' ? now() : now).toISOString();
  const read = async url => {
    const response = await fetchImpl(url, { headers: { 'User-Agent': 'HalfSaintsMenuSync/1.0' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}: ${url}`);
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error(`Source exceeds size limit: ${url}`);
    return { html, fetchedAt: timestamp() };
  };
  const current = await read(SOURCE_URL), index = await read(INDEX_URL);
  const currentRefs = discoverMenus(current.html, SOURCE_URL), indexRefs = discoverMenus(index.html, INDEX_URL);
  if (!indexRefs.length) throw new Error('Upcoming source index is empty or incomplete; previous snapshots retained');
  const refs = new Map();
  for (const ref of [...currentRefs, ...indexRefs]) {
    if (refs.has(ref.sourceUrl) && refs.get(ref.sourceUrl).weekEnding !== ref.weekEnding) throw new Error(`Conflicting week labels: ${ref.sourceUrl}`);
    refs.set(ref.sourceUrl, ref);
  }
  if (!refs.has(SOURCE_URL)) throw new Error('Current menu requires an explicit self-linked week');
  if (refs.size > 20) throw new Error('Too many discovered menu pages (maximum 20)');
  const entries = [...refs.values()], menus = Array(entries.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, entries.length) }, async () => {
    while (next < entries.length) {
      const i = next++, ref = entries[i], raw = ref.sourceUrl === SOURCE_URL ? current : await read(ref.sourceUrl);
      const $ = load(raw.html), title = normal($('h1').first().text());
      const menu = parseMenu(raw.html, raw.fetchedAt, { sourceUrl: ref.sourceUrl, allowDatedPage: ref.sourceUrl !== SOURCE_URL });
      if (!menu.weekEnding || menu.weekEnding !== ref.weekEnding) throw new Error(`Menu title/self-link disagrees with discovered week: ${ref.sourceUrl}`);
      menus[i] = { ...menu, sourceTitle: title, linkLabel: ref.label, isCurrent: ref.sourceUrl === SOURCE_URL, provisional: ref.sourceUrl !== SOURCE_URL, provisionalNotice: ref.sourceUrl === SOURCE_URL ? null : PROVISIONAL_NOTICE };
    }
  }));
  const completedAt = timestamp();
  const currentMenu = menus.find(menu => menu.isCurrent);
  const currentWeek = weekRange(lasVegasDate(new Date(completedAt)));
  if (!currentMenu || currentMenu.weekEnding < currentWeek.start || currentMenu.weekEnding > currentWeek.end) throw new Error('Current source week is stale or does not match the current Las Vegas week; previous snapshots retained');
  const calendar = retainCalendar(buildCalendar(menus, completedAt), new Date(completedAt));
  if (onCurrentMenu) await onCurrentMenu(currentMenu);
  calendar.discovery = { sources: [{ sourceUrl: SOURCE_URL, fetchedAt: current.fetchedAt }, { sourceUrl: INDEX_URL, fetchedAt: index.fetchedAt }], rawEventCount: menus.reduce((n, m) => n + m.events.length, 0) };
  const target = resolve(path), temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  try { await writeFile(temporary, JSON.stringify(calendar, null, 2) + '\n', 'utf8'); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
  return calendar;
}
