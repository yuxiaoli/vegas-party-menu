import {filterCalendar, globalSearchState} from './calendar-filters.js';
export function initCalendar() {
  const filters = document.querySelector('#filters[data-calendar]');
  if (!filters) return;
  const cards = [...document.querySelectorAll('.event-card')];
  const records = cards.map((card,index)=>({index,eventDate:card.dataset.eventDate || null,weekEnding:card.dataset.weekEnding || null,section:card.dataset.category,days:card.dataset.days.split(' '),search:card.dataset.search}));
  const search = document.querySelector('#search'), date = document.querySelector('#calendar-date');
  const categoryButtons = [...document.querySelectorAll('[data-category-filter]')], dayButtons = [...document.querySelectorAll('[data-day]')], periodButtons = [...document.querySelectorAll('[data-period]')];
  const clear = document.querySelector('#clear'), empty = document.querySelector('#empty-state');
  const readState = () => {
    const p = new URLSearchParams(location.search);
    return {query:p.get('q') || '',category:categoryButtons.some(b=>b.dataset.categoryFilter === p.get('type')) ? p.get('type') : 'All',day:dayButtons.some(b=>b.dataset.day === p.get('day')) ? p.get('day') : 'All',period:periodButtons.some(b=>b.dataset.period === p.get('period')) ? p.get('period') : 'All',date:[...date.options].some(o=>o.value && o.value === p.get('date')) ? p.get('date') : ''};
  };
  let state = readState();
  function update(writeHistory = true) {
    const visible = new Set(filterCalendar(records,state).map(e=>e.index));
    cards.forEach((card,i)=>card.hidden = !visible.has(i));
    search.value = state.query; date.value = state.date;
    categoryButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.categoryFilter === state.category)));
    dayButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.day === state.day)));
    periodButtons.forEach(b=>b.setAttribute('aria-pressed',String(!state.date && b.dataset.period === state.period)));
    const active = state.category !== 'All' || state.day !== 'All' || state.period !== 'All' || state.date || state.query;
    clear.hidden = !active; empty.hidden = visible.size !== 0;
    document.querySelector('#result-count').textContent = active ? `Showing ${visible.size} of ${cards.length} listings` : `Showing all ${cards.length} listings`;
    document.querySelector('#date-filter-note').textContent = state.query && state.period === 'All' && !state.date ? 'Searching all collected dates. You can refine the results below.' : state.period !== 'All' || state.date ? 'Only explicitly dated listings. Undated recurring listings remain in All dates.' : 'All collected menus. Undated recurring listings keep their original source-week label.';
    if(writeHistory) {
      const url = new URL(location.href);
      [['q',state.query.trim()],['type',state.category],['day',state.day],['period',state.period],['date',state.date]].forEach(([key,value])=>value && value !== 'All' ? url.searchParams.set(key,value) : url.searchParams.delete(key));
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
  }
  search.addEventListener('input',()=>{state=globalSearchState(search.value);update();});
  categoryButtons.forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.categoryFilter;update();}));
  dayButtons.forEach(b=>b.addEventListener('click',()=>{state.day=b.dataset.day;update();}));
  periodButtons.forEach(b=>b.addEventListener('click',()=>{state.period=b.dataset.period;state.date='';update();}));
  date.addEventListener('change',()=>{state.date=date.value;state.period='All';update();});
  const reset=()=>{state=globalSearchState('');update();};
  clear.addEventListener('click',()=>{reset();categoryButtons[0].focus();});
  document.querySelector('#empty-reset').addEventListener('click',()=>{reset();search.focus();});
  addEventListener('popstate',()=>{state=readState();update(false);});
  setInterval(()=>update(false),60000);
  update(false);filters.hidden=false;
}
