import {filterCalendar, globalSearchState, defaultCalendarState, periodFromParams, calendarSearchParams, isRetainedEvent, lasVegasDate, weekRange, DEFAULT_PERIOD} from './calendar-filters.js';
export function initCalendar() {
  const filters = document.querySelector('#filters[data-calendar]');
  if (!filters) return;
  let cards = [...document.querySelectorAll('.event-card')];
  let records = cards.map((card,index)=>({index,eventDate:card.dataset.eventDate || null,weekEnding:card.dataset.weekEnding || null,section:card.dataset.category,days:card.dataset.days.split(' '),search:card.dataset.search}));
  const search = document.querySelector('#search'), date = document.querySelector('#calendar-date');
  const categoryButtons = [...document.querySelectorAll('[data-category-filter]')], dayButtons = [...document.querySelectorAll('[data-day]')], periodButtons = [...document.querySelectorAll('[data-period]')];
  const clear = document.querySelector('#clear'), empty = document.querySelector('#empty-state');
  const readState = () => {
    const p = new URLSearchParams(location.search);
    return {query:p.get('q') || '',category:categoryButtons.some(b=>b.dataset.categoryFilter === p.get('type')) ? p.get('type') : 'All',day:dayButtons.some(b=>b.dataset.day === p.get('day')) ? p.get('day') : 'All',period:periodFromParams(p),date:[...date.options].some(o=>o.value && o.value === p.get('date')) ? p.get('date') : ''};
  };
  let state = readState();
  function update(writeHistory = true) {
    const now = new Date(), cutoff = weekRange(lasVegasDate(now)).start;
    // Retire past weeks even when a tab stays open across local Monday midnight.
    const retained = records.filter(record=>isRetainedEvent(record,now));
    const removed = records.filter(record=>!isRetainedEvent(record,now));
    removed.forEach(record=>cards[record.index].remove());
    cards = retained.map(record=>cards[record.index]);
    records = retained.map((record,index)=>({...record,index}));
    [...date.options].filter(option=>option.value && option.value < cutoff).forEach(option=>option.remove());
    if(state.date && state.date < cutoff) {state.date='';state.period=DEFAULT_PERIOD;writeHistory=true;}
    categoryButtons.forEach(button=>{button.querySelector('span').textContent=records.filter(record=>button.dataset.categoryFilter === 'All' || record.section === button.dataset.categoryFilter).length;});
    const totals=document.querySelectorAll('.lineup-summary strong');
    totals[0].textContent=records.length;totals[1].textContent=new Set(cards.map(card=>card.querySelector('.venue').textContent)).size;
    const visible = new Set(filterCalendar(records,state,now).map(e=>e.index));
    cards.forEach((card,i)=>card.hidden = !visible.has(i));
    search.value = state.query; date.value = state.date;
    categoryButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.categoryFilter === state.category)));
    dayButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.day === state.day)));
    periodButtons.forEach(b=>b.setAttribute('aria-pressed',String(!state.date && b.dataset.period === state.period)));
    const active = state.category !== 'All' || state.day !== 'All' || state.period !== DEFAULT_PERIOD || state.date || state.query;
    clear.hidden = !active; empty.hidden = visible.size !== 0;
    document.querySelector('#result-count').textContent = `Showing ${visible.size} of ${cards.length} listings`;
    document.querySelector('#date-filter-note').textContent = state.query && state.period === 'All' && !state.date ? 'Searching this week and all collected future dates. Refine the results below.' : state.period !== 'All' || state.date ? 'Only explicitly dated listings. Undated recurring listings remain in All dates.' : 'This week and future weeks only. Undated recurring listings keep their source-week label.';
    if(writeHistory) {
      const url = new URL(location.href);
      const params=calendarSearchParams(state);
      ['q','type','day','period','date'].forEach(key=>params.has(key) ? url.searchParams.set(key,params.get(key)) : url.searchParams.delete(key));
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
  }
  search.addEventListener('input',()=>{state=search.value.trim() ? globalSearchState(search.value) : defaultCalendarState();update();});
  categoryButtons.forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.categoryFilter;update();}));
  dayButtons.forEach(b=>b.addEventListener('click',()=>{state.day=b.dataset.day;update();}));
  periodButtons.forEach(b=>b.addEventListener('click',()=>{state.period=b.dataset.period;state.date='';update();}));
  date.addEventListener('change',()=>{state.date=date.value;state.period='All';update();});
  const reset=()=>{state=defaultCalendarState();update();};
  clear.addEventListener('click',()=>{reset();categoryButtons[0].focus();});
  document.querySelector('#empty-reset').addEventListener('click',()=>{reset();search.focus();});
  addEventListener('popstate',()=>{state=readState();update(false);});
  setInterval(()=>update(false),60000);
  update(false);filters.hidden=false;
}
