import {
  calendarSearchParams, defaultCalendarState, DEFAULT_PERIOD, filterCalendar, filterMenu,
  globalSearchState, isRetainedEvent, lasVegasDate, PERIODS, periodFromParams, weekRange
} from './calendar-filters.js';
import { initDatePicker } from './date-picker.js';

const filterParams = ['q', 'type', 'day', 'period', 'date'];

export function initCalendar(t, format, syncLocaleLinks) {
  const { number } = format;
  const filters = document.querySelector('#filters');
  if (!filters) return;

  let records = [...document.querySelectorAll('.event-card')].map(card => ({
    card,
    eventDate: card.dataset.eventDate || null,
    weekEnding: card.dataset.weekEnding || null,
    section: card.dataset.category,
    days: card.dataset.days.split(' '),
    search: card.dataset.search,
    venue: card.querySelector('.venue').dataset.venue
  }));
  const search = document.querySelector('#search');
  const pickerElement = document.querySelector('#calendar-picker');
  const date = pickerElement && initDatePicker(pickerElement, t, format, value => {
    state.date = value;
    state.period = 'All';
    applyFilters();
  });
  const availableDates = () => new Set(records.map(record => record.eventDate).filter(Boolean));
  const categoryButtons = [...filters.querySelectorAll('[data-category-filter]')];
  const dayButtons = [...filters.querySelectorAll('[data-day]')];
  const periodButtons = [...filters.querySelectorAll('[data-period]')];
  const clear = document.querySelector('#clear');
  const empty = document.querySelector('#empty-state');
  const error = document.querySelector('#filter-error');
  const resultCount = document.querySelector('#result-count');
  const dateNote = document.querySelector('#date-filter-note');
  const [listingTotal, venueTotal] = document.querySelectorAll('.lineup-summary strong');
  let composing = false;
  let invalidFilter = false;

  function showInvalidFilter(invalid) {
    invalidFilter = invalid;
    if (error) error.hidden = !invalid;
  }

  function readState() {
    const params = new URLSearchParams(location.search);
    const category = categoryButtons.find(button => button.dataset.categoryFilter === params.get('type'));
    const day = dayButtons.find(button => button.dataset.day === params.get('day'));
    const validPeriod = date && PERIODS.includes(params.get('period'));
    const requestedDate = params.get('date');
    const selectedDate = date && availableDates().has(requestedDate) ? requestedDate : '';
    showInvalidFilter(
      (params.has('type') && !category) || (params.has('day') && !day)
      || (params.has('period') && !validPeriod) || (params.has('date') && !selectedDate)
    );
    if (!selectedDate) params.delete('date');
    return {
      query: params.get('q') || '',
      category: category?.dataset.categoryFilter || 'All',
      day: day?.dataset.day || 'All',
      period: date ? periodFromParams(params) : DEFAULT_PERIOD,
      date: selectedDate
    };
  }

  let state = readState();

  function update(writeHistory = true) {
    const now = new Date();
    if (date) {
      // An already open tab can cross Las Vegas Monday midnight.
      const cutoff = weekRange(lasVegasDate(now)).start;
      records = records.filter(record => {
        if (isRetainedEvent(record, now)) return true;
        record.card.remove();
        return false;
      });
      if (state.date && state.date < cutoff) {
        state.date = '';
        state.period = DEFAULT_PERIOD;
        showInvalidFilter(true);
        writeHistory = true;
      }
      for (const button of categoryButtons) {
        const category = button.dataset.categoryFilter;
        const count = category === 'All' ? records.length : records.filter(record => record.section === category).length;
        button.querySelector('span').textContent = number(count);
      }
      listingTotal.textContent = number(records.length);
      const venues = new Set(records.map(record => record.venue).filter(Boolean));
      venueTotal.textContent = number(venues.size);
      date.sync(availableDates(), state.date);
      for (const button of periodButtons) {
        button.setAttribute('aria-pressed', String(!state.date && button.dataset.period === state.period));
      }
      const note = state.query && state.period === 'All' && !state.date ? 'filter.searchNote'
        : state.period !== 'All' || state.date ? 'filter.datedNote' : 'filter.allNote';
      dateNote.textContent = t(note);
    }

    const visible = new Set(date ? filterCalendar(records, state, now) : filterMenu(records, state));
    for (const record of records) record.card.hidden = !visible.has(record);
    if (!composing && search.value !== state.query) search.value = state.query;
    for (const button of categoryButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === state.category));
    }
    for (const button of dayButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.day === state.day));
    }
    const active = state.category !== 'All' || state.day !== 'All'
      || state.period !== DEFAULT_PERIOD || Boolean(state.date || state.query.trim());
    clear.hidden = !active && !invalidFilter;
    empty.hidden = visible.size !== 0;
    const count = t(date || active ? 'results.filtered' : 'results.all', {
      count: number(visible.size),
      total: number(records.length)
    });
    if (resultCount.textContent !== count) resultCount.textContent = count;

    if (writeHistory) {
      const url = new URL(location.href);
      const params = calendarSearchParams(state);
      if (!date) params.delete('period');
      for (const key of filterParams) {
        if (params.has(key)) url.searchParams.set(key, params.get(key));
        else url.searchParams.delete(key);
      }
      if (url.href !== location.href) history.replaceState(history.state, '', url);
    }
    syncLocaleLinks();
  }

  function applyFilters() {
    showInvalidFilter(false);
    update();
  }

  function updateSearch() {
    if (composing || search.value === state.query) return;
    if (date) state = search.value.trim() ? globalSearchState(search.value) : defaultCalendarState();
    else state.query = search.value;
    applyFilters();
  }
  search.addEventListener('compositionstart', () => { composing = true; });
  search.addEventListener('compositionend', () => {
    composing = false;
    updateSearch();
  });
  search.addEventListener('input', updateSearch);
  for (const button of categoryButtons) {
    button.addEventListener('click', () => {
      state.category = button.dataset.categoryFilter;
      applyFilters();
    });
  }
  for (const button of dayButtons) {
    button.addEventListener('click', () => {
      state.day = button.dataset.day;
      applyFilters();
    });
  }
  for (const button of periodButtons) {
    button.addEventListener('click', () => {
      state.period = button.dataset.period;
      state.date = '';
      applyFilters();
    });
  }
  function reset() {
    state = defaultCalendarState();
    applyFilters();
  }
  clear.addEventListener('click', () => {
    reset();
    categoryButtons[0].focus();
  });
  document.querySelector('#empty-reset').addEventListener('click', () => {
    reset();
    search.focus();
  });
  addEventListener('popstate', () => {
    state = readState();
    update(false);
  });
  if (date) setInterval(() => update(false), 60000);
  update(false);
  filters.hidden = false;
}
