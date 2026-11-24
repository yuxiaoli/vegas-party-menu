import { createTranslator, LOCALES } from './messages.js';

export const DEFAULT_PERIOD = 'This week';
export const PERIODS = ['This week', 'Next week', 'Upcoming', 'All'];
export const TIME_ZONE = 'America/Los_Angeles';
export const CATEGORIES = ['Dayclubs', 'Nightclubs', 'After Parties'];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const translators = Object.keys(LOCALES).map(createTranslator);
const normalizeSearch = text => String(text ?? '').normalize('NFKC').trim().toLowerCase();
const categoryTerms = new Map(CATEGORIES.map(id => [id, translators.map(t => normalizeSearch(t(`category.${id}`)))]));
const dayTerms = new Map(DAYS.map(id => [id, translators.flatMap(t => [
  normalizeSearch(t(`day.${id}`)), normalizeSearch(t(`dayShort.${id}`))
])]));
const noTerms = [];
const vegasDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export function lasVegasDate(now = new Date()) {
  return vegasDateFormat.format(now);
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
export function filterMenu(events, state = {}) {
  const query = normalizeSearch(state.query);
  return events.filter(event => {
    const days = event.days || noTerms;
    return (!state.category || state.category === 'All' || event.section === state.category)
      && (!state.day || state.day === 'All' || days.includes(state.day))
      && (!query || normalizeSearch(event.search).includes(query)
        || (categoryTerms.get(event.section) || noTerms).some(term => term.includes(query))
        || days.some(day => (dayTerms.get(day) || noTerms).some(term => term.includes(query))));
  });
}
export function filterCalendar(events, state = {}, now = new Date()) {
  return filterMenu(events, state).filter(event => dateMatches(event, state.period || DEFAULT_PERIOD, state.date || '', now));
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
