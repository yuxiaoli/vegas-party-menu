import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { syncCalendar } from './menu-calendar.mjs';

const LEGACY_FIELDS = ['sourceUrl', 'fetchedAt', 'weekEnding', 'sections', 'events', 'links'];

// One collection produces both public representations. Each replacement is atomic;
// collection/validation/staging failures cannot replace either existing snapshot.
export async function syncAllMenus({ menuPath = 'data/menu.json', calendarPath = 'data/calendar.json', fetchImpl = fetch, now } = {}) {
  const menuTarget = resolve(menuPath), calendarTarget = resolve(calendarPath);
  if (menuTarget === calendarTarget) throw new Error('Menu and calendar targets must differ');
  const id = randomUUID();
  const menuStage = `${menuTarget}.${id}.stage`, calendarStage = `${calendarTarget}.${id}.stage`;
  const restoreStage = `${calendarTarget}.${id}.restore`;
  let keepRecovery = false, previousCalendar;
  try {
    let current;
    const calendar = await syncCalendar({ path: calendarStage, fetchImpl, now, onCurrentMenu: menu => { current = menu; } });
    if (!current) throw new Error('Expected exactly one verified current menu');
    if (!current.events.length || !current.sections.length || !Number.isFinite(Date.parse(current.fetchedAt))) throw new Error('Current menu is incomplete');
    const menu = Object.fromEntries(LEGACY_FIELDS.map(field => [field, current[field]]));
    if (LEGACY_FIELDS.some(field => menu[field] === undefined)) throw new Error('Missing legacy menu field');
    await mkdir(dirname(menuTarget), { recursive: true });
    await writeFile(menuStage, JSON.stringify(menu, null, 2) + '\n', 'utf8');
    // Prepare recovery before replacing either target. No token/configuration data.
    try { previousCalendar = await readFile(calendarTarget); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previousCalendar) await writeFile(restoreStage, previousCalendar);
    await rename(calendarStage, calendarTarget);
    try { await rename(menuStage, menuTarget); }
    catch (error) {
      try {
        if (previousCalendar) await rename(restoreStage, calendarTarget);
        else await rm(calendarTarget, { force: true });
      } catch (recoveryError) {
        keepRecovery = true;
        throw new AggregateError([error, recoveryError], 'Menu replacement failed and calendar recovery failed; inspect both snapshots before publishing');
      }
      throw error;
    }
    return { menu, calendar };
  } finally {
    await Promise.all([menuStage, calendarStage, ...(!keepRecovery ? [restoreStage] : [])].map(path => rm(path, { force: true })));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { menu, calendar } = await syncAllMenus();
    console.log(`Collected ${calendar.menus.length} menus once: ${calendar.events.length} calendar listings and ${menu.events.length} current-menu listings.`);
  } catch (error) {
    console.error(`Menu synchronization failed; do not publish partial output: ${error.message}`);
    process.exitCode = 1;
  }
}
