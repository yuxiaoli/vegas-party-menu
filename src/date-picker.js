import { DAYS, lasVegasDate } from './calendar-filters.js';

export function monthDays(month) {
  const first = new Date(month + '-01T12:00:00Z');
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const length = Math.round((next - first) / 86400000);
  return {
    offset: (first.getUTCDay() + 6) % 7,
    days: Array.from({ length }, (_, index) => month + '-' + String(index + 1).padStart(2, '0'))
  };
}

function adjacentMonth(month, delta) {
  const day = new Date(month + '-01T12:00:00Z');
  day.setUTCMonth(day.getUTCMonth() + delta);
  return day.toISOString().slice(0, 7);
}

export function initDatePicker(picker, t, format, onSelect) {
  const trigger = picker.querySelector('#calendar-date');
  const panel = picker.querySelector('#calendar-panel');
  const title = picker.querySelector('#calendar-month');
  const dayGrid = picker.querySelector('#calendar-days');
  const prev = picker.querySelector('[data-month-offset="-1"]');
  const next = picker.querySelector('[data-month-offset="1"]');
  const clear = picker.querySelector('#calendar-clear-date');
  const fullDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  let dates = new Set();
  let selected = '';
  let month = '';

  function close(restoreFocus = false) {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function render() {
    if (!dates.size || !month) { close(); return; }
    const sorted = [...dates].sort();
    prev.disabled = month <= sorted[0].slice(0, 7);
    next.disabled = month >= sorted.at(-1).slice(0, 7);
    title.textContent = format.date(month + '-01', { month: 'long', year: 'numeric' });
    clear.disabled = !selected;
    const { offset, days } = monthDays(month);
    const cells = DAYS.map(day => {
      const el = document.createElement('span');
      el.textContent = t('dayShort.' + day);
      el.className = 'calendar-weekday';
      el.title = t('day.' + day);
      return el;
    });
    for (let i = 0; i < offset; i++) cells.push(document.createElement('span'));
    const today = lasVegasDate();
    for (const date of days) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.textContent = format.number(Number(date.slice(-2)));
      cell.setAttribute('aria-label', format.date(date, fullDate));
      cell.setAttribute('aria-pressed', String(date === selected));
      cell.dataset.calendarDay = date;
      cell.disabled = !dates.has(date);
      if (date === today) cell.setAttribute('aria-current', 'date');
      cells.push(cell);
    }
    dayGrid.replaceChildren(...cells);
  }

  function sync(availableDates, value) {
    const changed = selected !== value || dates.size !== availableDates.size
      || [...availableDates].some(date => !dates.has(date));
    dates = availableDates;
    selected = value;
    trigger.disabled = !dates.size;
    trigger.textContent = value ? format.date(value, fullDate) : t('filter.chooseDate');
    if (!panel.hidden && changed) render();
  }

  trigger.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    const sorted = [...dates].sort();
    if (!sorted.length) return;
    const first = sorted[0].slice(0, 7);
    const last = sorted.at(-1).slice(0, 7);
    month = selected ? selected.slice(0, 7) : [first, lasVegasDate().slice(0, 7), last].sort()[1];
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    render();
  });
  for (const button of [prev, next]) button.addEventListener('click', () => {
    month = adjacentMonth(month, Number(button.dataset.monthOffset));
    render();
    if (button.disabled) (button === prev ? next : prev).focus();
  });
  dayGrid.addEventListener('click', event => {
    const date = event.target.closest('[data-calendar-day]')?.dataset.calendarDay;
    if (!dates.has(date)) return;
    close(true);
    onSelect(date);
  });
  clear.addEventListener('click', () => {
    close(true);
    onSelect('');
  });
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      close(true);
    }
  });
  picker.addEventListener('focusout', event => {
    if (event.relatedTarget && !picker.contains(event.relatedTarget)) close();
  });
  document.addEventListener('click', event => {
    if (!picker.contains(event.target)) close();
  });
  return { sync };
}
