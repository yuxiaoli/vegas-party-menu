export const TIME_ZONE = 'America/Los_Angeles';
export function lasVegasDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
}
export function weekRange(today, offset = 0) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7 + offset * 7);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return {start, end: date.toISOString().slice(0, 10)};
}
export function dateMatches(event, period = 'All', selectedDate = '', now = new Date()) {
  if (selectedDate) return Boolean(event.eventDate && event.eventDate === selectedDate);
  if (period === 'All') return true;
  const today = lasVegasDate(now);
  if (period === 'Upcoming') return Boolean(event.eventDate && event.eventDate >= today);
  const range = weekRange(today, period === 'Next week' ? 1 : 0);
  return Boolean(event.eventDate && event.eventDate >= range.start && event.eventDate <= range.end);
}
export function filterCalendar(events, state = {}, now = new Date()) {
  const query = (state.query || '').trim().toLowerCase();
  return events.filter(event => dateMatches(event, state.period || 'All', state.date || '', now)
    && (!state.category || state.category === 'All' || event.section === state.category)
    && (!state.day || state.day === 'All' || event.days.includes(state.day))
    && (!query || event.search.includes(query)));
}
export function globalSearchState(query) { return {query, period: 'All', date: '', day: 'All', category: 'All'}; }
