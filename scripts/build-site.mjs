import { isRetainedEvent } from '../src/calendar-filters.js';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { renderSite } from '../src/site.js';
import { DEFAULT_LOCALE, LOCALES } from '../src/messages.js';
import { handleRequest } from '../src/api.js';
import { loadDJCatalog } from './dj-catalog.mjs';
import { loadVenueCatalog } from './venue-catalog.mjs';
const menu = JSON.parse(await readFile('data/menu.json', 'utf8'));
if (!menu.events?.length || !Number.isFinite(Date.parse(menu.fetchedAt))) throw new Error('Refusing to publish an invalid or empty snapshot');
if (menu.weekEnding != null && !/^\d{4}-\d{2}-\d{2}$/.test(menu.weekEnding)) throw new Error('Invalid source week');
let calendar = null;
try { calendar = JSON.parse(await readFile('data/calendar.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (calendar && (calendar.schemaVersion !== 1 || calendar.timeZone !== 'America/Los_Angeles' || !calendar.events?.length || !calendar.menus?.length || !Number.isFinite(Date.parse(calendar.fetchedAt)))) throw new Error('Invalid multiweek calendar snapshot');
const buildTime = new Date();
const siteMenu = calendar ? {...menu, events:calendar.events.filter(event=>isRetainedEvent(event,buildTime))} : menu;
await rm('site-dist', { recursive: true, force: true });
await mkdir('site-dist/data', { recursive: true });
await mkdir('site-dist/assets', { recursive: true });
const [djCatalog, venueCatalog] = await Promise.all([loadDJCatalog(siteMenu), loadVenueCatalog(siteMenu)]);
await writeFile('site-dist/data/dj-matches.json', JSON.stringify(djCatalog, null, 2) + '\n');
await writeFile('site-dist/data/venue-matches.json', JSON.stringify(venueCatalog, null, 2) + '\n');
// Keep the markup and its controller in the same response. Cached HTML and
// JavaScript from different releases cannot leave the filters uninitialized.
const { outputFiles: [bundle] } = await build({
  entryPoints: ['src/menu-client.js'], bundle: true, minify: true,
  format: 'esm', target: ['es2022'], write: false,
});
// Older cached pages still load this URL.
await writeFile('site-dist/assets/menu.js', bundle.contents);
for (const locale of Object.keys(LOCALES)) {
  const isDefault = locale === DEFAULT_LOCALE;
  const directory = isDefault ? 'site-dist' : `site-dist/${locale}`;
  const siteRoot = isDefault ? './' : '../';
  const html = renderSite(siteMenu, { source: 'github_pages_snapshot', remoteRead: 'ok' }, buildTime, djCatalog, venueCatalog, calendar, { locale, siteRoot, clientBundle: bundle.text });
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/index.html`, html);
}
await copyFile('data/menu.json', 'site-dist/data/menu.json');
if (calendar) await copyFile('data/calendar.json', 'site-dist/data/calendar.json');
const rss = handleRequest(new Request('https://example.invalid/rss.xml'), menu);
await writeFile('site-dist/rss.xml', await rss.text());
await writeFile('site-dist/.nojekyll', '');
console.log(`Built menu-only GitHub Pages site: ${siteMenu.events.length} listings, ${new Set(siteMenu.events.map(event => event.venue)).size} venues. Snapshot ${menu.fetchedAt}.`);

console.log(`DJ catalog: ${djCatalog.status}; ${djCatalog.matchedListingCount} matched listings; edition ${djCatalog.year ?? 'unavailable'}.`);
console.log(`Venue catalog: ${venueCatalog.status}; ${venueCatalog.venues.length} verified venues; ${venueCatalog.matchedListingCount} matched listings.`);

if (calendar) console.log(`Calendar: ${calendar.menus.length} source menus; ${calendar.events.length} deduplicated listings; ${calendar.warnings.length} source date warnings.`);
