import { initCalendar } from './calendar-client.js';
import { freshness } from './freshness.js';
const bar = document.querySelector('.menu-status');
function update() {
  const state = freshness(bar.dataset.weekEnding || null);
  bar.classList.toggle('status-warning', state.warning);
  const multiweek = Boolean(document.querySelector('#filters[data-calendar]'));
  bar.querySelector('strong').textContent = multiweek && state.warning ? 'Current-menu snapshot is older' : state.label;
  let explanation = bar.querySelector('.status-explanation');
  if (!explanation) { explanation = document.createElement('p'); explanation.className = 'status-explanation'; bar.append(explanation); }
  explanation.textContent = multiweek && state.warning ? 'The current-menu source week has ended. Other collected weeks remain below; use their explicit dates and confirm source conditions.' : state.explanation;
}
update();
setInterval(update, 60000);

initCalendar();
