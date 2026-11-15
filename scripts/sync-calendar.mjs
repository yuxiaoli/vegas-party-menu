import { syncCalendar } from './menu-calendar.mjs';
try {
  const data = await syncCalendar();
  console.log(`Collected ${data.menus.length} menus and ${data.events.length} unique listings; ${data.warnings.length} source date warnings.`);
} catch(error) {
  console.error(`Calendar synchronization failed; previous calendar retained: ${error.message}`);
  process.exitCode = 1;
}
