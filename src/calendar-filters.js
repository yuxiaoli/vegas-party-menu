export const DEFAULT_PERIOD = 'This week';
export const PERIODS = ['This week', 'Next week', 'Upcoming', 'All'];
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
export function isRetainedEvent(event, now = new Date()) {
  const cutoff = weekRange(lasVegasDate(now)).start;
  const date = event.eventDate || event.weekEnding;
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= cutoff);
}
export function dateMatches(event, period = DEFAULT_PERIOD, selectedDate = '', now = new Date()) {
  if (!isRetainedEvent(event, now)) return false;
  if (selectedDate) return Boolean(event.eventDate && event.eventDate === selectedDate);
  if (period === 'All') return true;
  const today = lasVegasDate(now);
  if (period === 'Upcoming') return Boolean(event.eventDate && event.eventDate >= today);
  const range = weekRange(today, period === 'Next week' ? 1 : 0);
  return Boolean(event.eventDate && event.eventDate >= range.start && event.eventDate <= range.end);
}
export function filterCalendar(events, state = {}, now = new Date()) {
  const query = (state.query || '').trim().toLowerCase();
  return events.filter(event => dateMatches(event, state.period || DEFAULT_PERIOD, state.date || '', now)
    && (!state.category || state.category === 'All' || event.section === state.category)
    && (!state.day || state.day === 'All' || event.days.includes(state.day))
    && (!query || event.search.includes(query)));
}
export function globalSearchState(query) { return {query, period: 'All', date: '', day: 'All', category: 'All'}; }

export function defaultCalendarState() { return {query:'',period:DEFAULT_PERIOD,date:'',day:'All',category:'All'}; }
export function periodFromParams(params) {
  const period = params.get('period');
  return PERIODS.includes(period) ? period : params.get('q')?.trim() || params.get('date') ? 'All' : DEFAULT_PERIOD;
}
export function calendarSearchParams(state) {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set('q',state.query.trim());
  if (state.category !== 'All') params.set('type',state.category);
  if (state.day !== 'All') params.set('day',state.day);
  const implicitPeriod = state.query.trim() || state.date ? 'All' : DEFAULT_PERIOD;
  if (state.period !== implicitPeriod) params.set('period',state.period);
  if (state.date) params.set('date',state.date);
  return params;
}
