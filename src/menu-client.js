import { initCalendar } from './calendar-client.js';
import { getFreshnessStatus } from './freshness.js';
import { initLocaleLinks } from './locale-navigation.js';
import { createFormatters, createTranslator } from './messages.js';

const locale = document.documentElement.lang;
const t = createTranslator(locale);
const format = createFormatters(locale);
const syncLocaleLinks = initLocaleLinks();
const status = document.querySelector('.menu-status');

if (status) {
  const calendar = Boolean(document.querySelector('#filters[data-calendar]'));
  const fallback = status.hasAttribute('data-fallback');
  const label = status.querySelector('strong');
  let explanation = status.querySelector('.status-explanation');
  if (!explanation) {
    explanation = document.createElement('p');
    explanation.className = 'status-explanation';
    status.append(explanation);
  }
  function updateFreshness() {
    const { key, warning } = getFreshnessStatus(status.dataset.weekEnding, { calendar, fallback });
    status.classList.toggle('status-warning', warning);
    label.textContent = t(`freshness.${key}`);
    explanation.textContent = t(`freshnessExplanation.${key}`);
  }
  updateFreshness();
  setInterval(updateFreshness, 60000);
}

const notice = document.querySelector('.visitor-menu-notice');
if (notice) {
  const calendar = Boolean(document.querySelector('#filters[data-calendar]'));
  const fallback = notice.hasAttribute('data-fallback');
  function updateVisitorNotice() {
    const { key, warning } = getFreshnessStatus(notice.dataset.weekEnding, { calendar, fallback });
    notice.hidden = !warning;
    notice.textContent = warning ? t(`freshnessExplanation.${key}`) : '';
  }
  updateVisitorNotice();
  setInterval(updateVisitorNotice, 60000);
}

initCalendar(t, format, syncLocaleLinks);
