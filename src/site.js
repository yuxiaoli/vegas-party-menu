import { isRetainedEvent, PERIODS, DEFAULT_PERIOD, DAYS, CATEGORIES } from './calendar-filters.js';
import { renderDJProfile, renderArtistHeading } from './dj-catalog.js';
import { renderVenueName } from './venue-catalog.js';
import { translateEntryDetails } from './entry-translation.js';
import { createFormatters, createTranslator, DEFAULT_LOCALE, LOCALES } from './messages.js';
import { getFreshnessStatus } from './freshness.js';
import { localeBootstrapScript } from './locale-navigation.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const DATE_WARNING_KEYS = new Map([
  ['Unrecognized explicit date', 'card.warningUnrecognized'],
  ['Missing verified source week', 'card.warningMissingWeek'],
  ['Invalid or ambiguous date near source week', 'card.warningAmbiguousDate'],
  ['Weekday does not match explicit calendar date', 'card.warningWeekdayMismatch'],
  ['Explicit event date is outside the advertised week-ending window', 'card.warningOutsideWeek'],
]);

export function eventDays(dateText) {
  const text = String(dateText || '');
  const start = DAYS.findIndex(day => text.startsWith(day));
  if (start < 0) return [];
  const range = text.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*-\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/);
  if (!range) return [DAYS[start]];
  const end = DAYS.indexOf(range[2]);
  return Array.from({ length: (end - start + 7) % 7 + 1 }, (_, index) => DAYS[(start + index) % 7]);
}

function renderEntry(details, locale, t) {
  if (!details?.trim()) return `<p>${escape(t('card.entryUnknown'))}</p>`;
  if (locale !== 'zh-CN') return `<p>${escape(details)}</p>`;

  const { parts, complete } = translateEntryDetails(details);
  if (!complete) return `<p>${escape(t('card.entryCheckSource'))}</p>`;
  return `<p>${parts.map(part => escape(part.text)).join('。')}。</p>`;
}

function sourceDateLabel(dateText, locale, t) {
  if (!dateText) return t('card.dateUnknown');
  if (locale !== 'zh-CN') return dateText;
  const weekdays = dateText.split(/\s*-\s*/);
  if (weekdays.length <= 2 && weekdays.every(day => DAYS.includes(day))) {
    return weekdays.map(day => t(`dayShort.${day}`)).join('至');
  }
  return dateText;
}

export function renderSite(menu, snapshot, now = new Date(), djCatalog = null, venueCatalog = null, calendar = null, {
  locale = DEFAULT_LOCALE, siteRoot = '/', clientScript = '', clientBundle = ''
} = {}) {
  const t = createTranslator(locale);
  const format = createFormatters(locale);
  const tr = (key, values) => escape(t(key, values));
  const localized = locale !== DEFAULT_LOCALE;
  const isPages = Boolean(clientScript || clientBundle);
  const homeUrl = isPages ? './' : '/';
  const rssUrl = `${siteRoot}rss.xml`;
  const dataUrl = isPages ? `${siteRoot}data/menu.json` : '/api/menu';
  const languageLinks = Object.entries(LOCALES).filter(([code]) => code !== locale).map(([code, label]) => {
    const href = code === DEFAULT_LOCALE ? `${siteRoot}?lang=${code}` : `${siteRoot}${code}/`;
    return `<a class="locale-link" href="${escape(href)}" data-locale-link="${code}" lang="${code}" hreflang="${code}">${escape(label)}</a>`;
  }).join('');
  const weekEnding = Number.isFinite(Date.parse(`${menu.weekEnding}T12:00:00Z`)) ? menu.weekEnding : '';
  const weekLabel = weekEnding ? format.date(weekEnding) : t('freshness.unknownWeek');
  const ticketDate = weekEnding ? format.date(weekEnding, { month: 'short', day: 'numeric' }).toUpperCase() : t('ticket.unknown');
  const ticketYear = weekEnding ? format.date(weekEnding, { year: 'numeric' }) : t('ticket.unknownYear');
  const fallback = snapshot.source === 'bundled_fallback';
  const status = getFreshnessStatus(weekEnding, { now, calendar: isPages && Boolean(calendar), fallback, pages: isPages });
  const captured = format.timestamp(menu.fetchedAt, { dateStyle: 'medium', timeStyle: 'short' });
  const events = calendar ? menu.events.filter(event => isRetainedEvent(event, now)) : menu.events;
  const venues = new Set(events.map(event => event.venue).filter(Boolean)).size;
  const dates = calendar ? [...new Set(events.map(event => event.eventDate).filter(Boolean))].sort() : [];
  const displayDate = iso => format.date(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const cards = events.map((event, index) => {
    const kind = event.section === 'Dayclubs' ? 'day' : event.section === 'After Parties' ? 'late' : 'night';
    const weekly = !/\d{1,2}\/\d{1,2}/.test(event.dateText || '');
    const dated = calendar && event.eventDate;
    const dateLabel = dated ? displayDate(event.eventDate) : sourceDateLabel(event.dateText, locale, t);
    const sourceWeek = localized && event.weekEnding ? format.date(event.weekEnding) : event.weekEnding;
    const sourceWeekLabel = calendar && !event.eventDate ? ` · ${tr('card.sourceWeek', { date: sourceWeek || t('card.sourceWeekUnknown') })}` : '';
    const provisional = calendar && event.provisional;
    const dateWarnings = calendar && event.dateWarnings?.map(warning => {
      const key = DATE_WARNING_KEYS.get(warning);
      return key ? t(key) : warning;
    }).join(localized ? '；' : '; ');
    return `<article class="event-card" data-category="${escape(event.section)}"${event.id ? ` data-event-id="${escape(event.id)}"` : ''}${calendar ? ` data-event-date="${escape(event.eventDate || '')}" data-week-ending="${escape(event.weekEnding || '')}"` : ''} data-days="${escape(eventDays(event.dateText).join(' '))}" data-search="${escape([event.venue, event.description, event.details, event.dateText].join(' '))}">
      <div class="card-top"><span class="kind kind-${kind}">${CATEGORIES.includes(event.section) ? tr(`category.${event.section}`) : escape(event.section)}</span><span class="event-number">${format.number(index + 1, { minimumIntegerDigits: 2, useGrouping: false })}</span></div>
      <p class="event-date">${dated ? `<time datetime="${escape(event.eventDate)}">${escape(dateLabel)}</time>` : escape(dateLabel)}
        ${weekly ? `<span class="recurring">${tr('card.recurring')}${sourceWeekLabel}</span>` : ''}
        ${calendar && !weekly && !event.eventDate ? `<span class="recurring">${tr('card.clarify')}</span>` : ''}
        ${provisional ? `<span class="advance-listing">${tr('card.advance')}</span>` : ''}
        ${dateWarnings ? `<span class="advance-listing">${tr('card.dateWarning', { warning: dateWarnings })} ${tr('card.sourceWeekLabel', { date: sourceWeek })}</span>` : ''}</p>
      <h3>${renderArtistHeading(event.description, djCatalog, { t, format, locale })}</h3>
      <p class="venue" data-venue="${escape(event.venue)}">${renderVenueName(event.venue, venueCatalog, { t, locale })}</p>
      ${renderDJProfile(event.description, djCatalog, { t, format, locale })}
      <div class="entry"><span class="entry-label">${tr('card.entryLabel')}</span>${renderEntry(event.details, locale, t)}</div>
    </article>`;
  }).join('');
  const extraSections = menu.sections.filter(section => section.title !== 'Introduction' && !CATEGORIES.includes(section.title));
  const originalSections = extraSections.map(section => `<details class="source-section"${localized ? ' lang="en"' : ''}><summary>${escape(section.title)} <span aria-hidden="true">+</span></summary><div>${section.blocks.map(block => `<p>${escape(block)}</p>`).join('')}</div></details>`).join('');
  const calendarControls = calendar ? `
    <div class="calendar-row">
      <div class="period-tabs" role="group" aria-label="${tr('filter.periodLabel')}">${PERIODS.map(period => `<button type="button" data-period="${period}" aria-pressed="${period === DEFAULT_PERIOD}">${tr(`period.${period}`)}</button>`).join('')}</div>
      <div class="date-choice" id="calendar-picker">
        <span id="calendar-date-label">${tr('filter.specificDate')}</span>
        <button type="button" id="calendar-date" aria-labelledby="calendar-date-label calendar-date" aria-expanded="false" aria-controls="calendar-panel">${tr('filter.chooseDate')}</button>
        <div class="calendar-panel" id="calendar-panel" role="group" aria-labelledby="calendar-month" hidden>
          <div class="calendar-month-row"><button type="button" data-month-offset="-1" aria-label="${tr('filter.previousMonth')}">‹</button><strong id="calendar-month" aria-live="polite"></strong><button type="button" data-month-offset="1" aria-label="${tr('filter.nextMonth')}">›</button></div>
          <div id="calendar-days" class="calendar-days"></div>
          <button type="button" id="calendar-clear-date">${tr('filter.clearDate')}</button>
        </div>
      </div>
    </div>
    <p id="date-filter-note" class="date-filter-note">${tr('filter.initialNote')}</p>` : '';
  const calendarCoverage = calendar ? `
    <aside class="calendar-coverage"><strong>${tr('coverage.menus', { count: format.number(calendar.menus.length) })}</strong>
      <span>${dates.length ? tr('coverage.through', { date: displayDate(dates.at(-1)) }) : tr('coverage.unavailable')} · ${tr('coverage.timeZone')}</span>
      <p>${tr('coverage.captured', { date: format.timestamp(calendar.fetchedAt, { dateStyle: 'medium' }) })} ${tr('coverage.notice')}
        <a href="https://halfsaintvegas.com/pages/upcoming-events" target="_blank" rel="noopener noreferrer">${tr('coverage.source')}</a> · <a href="${escape(siteRoot)}data/calendar.json">${tr('coverage.data')}</a>
      </p>
    </aside>` : '';
  return `<!doctype html>
<html lang="${escape(locale)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${tr('page.title')}</title>
<meta name="description" content="${tr('page.description')}">
<meta name="theme-color" content="#e7fa58">
<meta property="og:title" content="${tr('page.title')}"><meta property="og:description" content="${tr('page.ogDescription')}">
<link rel="alternate" type="application/rss+xml" title="${tr('page.rssTitle')}" href="${escape(rssUrl)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23e7fa58'/%3E%3Cpath d='M32 6l5 18 17-8-10 16 14 12-19-2-7 17-7-17-19 2 14-12L10 16l17 8z' fill='%231b1b19'/%3E%3C/svg%3E">
${isPages && !localized ? `<script>${localeBootstrapScript}</script>` : ''}
<style>${STYLES}</style>
</head>
<body>
<a class="skip-link" href="#lineup">${tr('nav.skip')}</a>
<header class="site-header">
  <a class="wordmark" href="${homeUrl}" aria-label="${tr('nav.home')}"><span class="brand-mark" aria-hidden="true">✳</span> VEGAS PARTIES<span class="brand-note">${tr('nav.brandNote')}</span></a>
  <nav aria-label="${tr('nav.name')}">
    <a href="#lineup">${tr('nav.lineup')} <span aria-hidden="true">↘</span></a>
    <a href="#before-you-go">${tr('nav.before')}</a>
  </nav>
  ${isPages ? `<nav class="language-links" aria-label="${tr('nav.language')}">${languageLinks}</nav>` : ''}
</header>
<main>
<section class="hero" aria-labelledby="hero-title">
  <div class="hero-copy">
    <div class="eyebrow"><span class="status-dot"></span> ${tr('hero.location')} <span class="hero-coordinate">36.1699° N / 115.1398° W</span></div>
    <h1 id="hero-title">${tr('hero.titleFirst')}<br><span>${tr('hero.titleSecond')}</span></h1>
    <div class="hero-bottom"><p>${tr('hero.tagline')}<br>${tr(calendar ? 'hero.calendarDescription' : 'hero.weeklyDescription')}</p><a class="primary-link" href="#lineup">${tr('hero.findNight')} <span aria-hidden="true">↘</span></a></div>
  </div>
  <aside class="week-ticket" aria-label="${tr('ticket.label')}">
    <div class="ticket-top"><span>${tr('ticket.topFirst')}<br>${tr('ticket.topSecond')}</span><span class="ticket-arrow" aria-hidden="true">↗</span></div>
    <div class="ticket-symbol" aria-hidden="true">✳</div>
    <div class="ticket-date"><span>${tr('ticket.weekEnding')}</span><strong>${escape(ticketDate)}</strong><span>${escape(ticketYear)}</span></div>
    <div class="ticket-bottom"><span>${tr('ticket.bottomFirst')}<br>${tr('ticket.bottomSecond')}</span><div class="barcode" aria-hidden="true"></div></div>
  </aside>
</section>
<div class="ticker" aria-hidden="true"><span>${tr('ticker.daylight')}</span><span>✳</span><span>${tr('ticker.frequency')}</span><span>✳</span><span>${tr('ticker.happens')}</span><span>✳</span></div>
<section class="menu-status${status.warning ? ' status-warning' : ''}" aria-label="${tr('freshness.label')}" data-week-ending="${escape(weekEnding)}"${fallback ? ' data-fallback' : ''}>
  <div><span class="status-dot"></span><strong>${tr(`freshness.${status.key}`)}</strong><span class="status-divider">/</span><span>${tr('freshness.weekEnding', { date: weekLabel })}</span></div>
  <p>${tr('freshness.captured', { date: captured })}</p>
  <p class="status-explanation">${tr(`freshnessExplanation.${status.key}`)}</p>
</section>
${calendarCoverage}
<section class="lineup-section" id="lineup" aria-labelledby="lineup-heading">
  <div class="section-heading">
    <div><p class="eyebrow">${tr('lineup.eyebrow')}</p><h2 id="lineup-heading">${tr('lineup.titleFirst')} <em>${tr('lineup.titleSecond')}</em></h2></div>
    <p class="lineup-summary"><strong>${format.number(events.length)}</strong> ${tr('lineup.listings')} <span>/</span> <strong>${format.number(venues)}</strong> ${tr('lineup.venues')}<br><span class="small-note">${tr('lineup.note')}</span></p>
  </div>
  <div class="filters" id="filters"${calendar ? ' data-calendar="true"' : ''} hidden>
    <div class="filter-row">
      <div class="category-tabs" role="group" aria-label="${tr('filter.typeLabel')}">
        <button type="button" data-category-filter="All" aria-pressed="true">${tr('category.All')} <span>${format.number(events.length)}</span></button>
        ${CATEGORIES.map(category => `<button type="button" data-category-filter="${category}" aria-pressed="false">${tr(`category.${category}`)} <span>${format.number(events.filter(event => event.section === category).length)}</span></button>`).join('')}
      </div>
      <label class="search-box"><span class="search-symbol" aria-hidden="true">⌕</span><span class="sr-only">${tr(calendar ? 'filter.calendarSearchLabel' : 'filter.searchLabel')}</span><input id="search" type="search" placeholder="${tr('filter.placeholder')}" autocomplete="off"></label>
    </div>
    ${calendarControls}
    <div class="days-row">
      <span class="filter-label">${tr('filter.pickDay')}</span>
      <div class="day-tabs" role="group" aria-label="${tr('filter.dayLabel')}">
        <button type="button" data-day="All" aria-pressed="true">${tr('day.All')}</button>
        ${DAYS.map(day => `<button type="button" data-day="${day}" aria-pressed="false" aria-label="${tr(`day.${day}`)}">${tr(`dayShort.${day}`)}</button>`).join('')}
      </div>
      <button id="clear" class="clear-button" type="button" hidden>${tr('filter.reset')}</button>
    </div>
    <p id="filter-error" role="status" hidden>${tr('filter.invalid')}</p>
  </div>
  <div class="results-heading"><p id="result-count" role="status" aria-live="polite">${tr('results.all', { total: format.number(events.length) })}</p><p>${tr('lineup.conditions')} <span aria-hidden="true">↙</span></p></div>
  <div class="event-grid" id="event-grid">${cards}</div>
  <div class="empty-state" id="empty-state" hidden><span aria-hidden="true">✳</span><h3>${tr('results.emptyTitle')}</h3><p>${tr('results.emptyText')}</p><button id="empty-reset" type="button">${tr(calendar ? 'results.calendarReset' : 'results.weeklyReset')}</button></div>
  <noscript><p class="no-script">${tr('results.noScript')}</p></noscript>
</section>
<section class="before-section" id="before-you-go" aria-labelledby="before-title">
  <div class="before-intro"><p class="eyebrow">${tr('before.eyebrow')}</p><h2 id="before-title">${tr('before.titleFirst')}<br>${tr('before.titleSecond')}</h2><p>${tr('before.description')}</p><a href="${escape(menu.sourceUrl)}" target="_blank" rel="noopener noreferrer">${tr('before.source')}</a></div>
  <div class="before-rules">
    ${['confirmation', 'conditions', 'snapshot'].map((key, index) => `<div><span>${format.number(index + 1, { minimumIntegerDigits: 2 })}</span><h3>${tr(`before.${key}Title`)}</h3><p>${tr(`before.${key}Text`)}</p></div>`).join('')}
  </div>
</section>
<section class="source-notes" aria-labelledby="source-notes-title">
  <div><p class="eyebrow">${tr('source.eyebrow')}</p><h2 id="source-notes-title">${tr('source.title')}</h2><p>${tr('source.description')}</p></div>
  <div class="source-details">
    ${originalSections}<details class="source-section dress-code" id="dress-code"><summary>${tr('dress.label')} <span aria-hidden="true">+</span></summary>
      <div><p>${tr('dress.description')}</p>
        <div class="dress-items">
          <div><h3>${tr('category.Dayclubs')}</h3><p>${tr('dress.day')}</p></div>
          <div><h3>${tr('category.Nightclubs')}</h3><p><strong>${tr('dress.menLabel')}</strong> ${tr('dress.men')} <strong>${tr('dress.womenLabel')}</strong> ${tr('dress.women')} <strong>${tr('dress.bothLabel')}</strong> ${tr('dress.both')}</p></div>
          <div><h3>${tr('dress.packTitle')}</h3><p>${tr('dress.packText')}</p></div>
        </div>
        <a class="dress-source" href="https://halfsaintvegas.com/pages/vegas-dress-code" target="_blank" rel="noopener noreferrer">${tr('dress.source')}</a>
        <p class="dress-observed">${tr('dress.observed', { date: format.date('2026-11-15', { month: 'long', day: 'numeric', year: 'numeric' }) })}</p>
      </div>
    </details>
  </div>
</section>
</main>
<footer>
  <div><a class="footer-brand" href="#" lang="en">VEGAS PARTIES <span aria-hidden="true">✳</span></a><p>${tr('footer.description')}<br>${tr('footer.disclaimer')}</p></div>
  <div class="footer-links">
    <a href="${escape(rssUrl)}">${tr('footer.rss')}</a>
    <a href="${escape(dataUrl)}">${tr(isPages ? 'footer.jsonSnapshot' : 'footer.jsonApi')}</a>
    ${isPages ? '' : `<a href="/openapi.json">${tr('footer.apiDocs')}</a>`}
    <a href="https://github.com/yuxiaoli/vegas-party-menu" target="_blank" rel="noopener noreferrer">${tr('footer.source')}</a>
  </div>
  <p class="footer-signoff">${tr('footer.signoffFirst')}<br>${tr('footer.signoffSecond')}</p>
  <p class="personal-credit" lang="en">Built by <a href="https://s.vectorindex.cloud/sean" target="_blank" rel="noopener noreferrer">Sean</a> with ❤️</p>
</footer>
${clientBundle ? `<script type="module">${clientBundle.replace(/<\/script/gi, tag => tag.replace('/', '\\/'))}</script>`
  : clientScript ? `<script type="module" src="${escape(clientScript)}"></script>` : ''}
</body></html>`;
}

const STYLES = `
:root{color-scheme:light;--paper:#f6f3eb;--ink:#1b1b19;--muted:#62635b;--line:#cfcec4;--acid:#e7fa58;--purple:#ddd8ef;--orange:#f4c6a6;font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--paper);font-synthesis:none}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}body{margin:0}a{color:inherit}button,input{font:inherit}button,a,input,summary{-webkit-tap-highlight-color:transparent}button,summary{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #6350bb;outline-offset:5px}button{color:inherit}button[hidden],[hidden]{display:none!important}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.skip-link{position:absolute;top:-70px;left:20px;z-index:50;background:var(--acid);padding:15px}.skip-link:focus{top:10px}.site-header{max-width:1480px;margin:auto;padding:27px 5%;display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line)}.wordmark{text-decoration:none;font-weight:900;font-size:23px;letter-spacing:-1.4px;display:flex;align-items:center;gap:9px}.brand-mark{font-size:37px;line-height:1}.brand-note{font-size:9px;letter-spacing:1.3px;width:57px;font-weight:700;margin-left:6px;line-height:1.5}.site-header nav{display:flex;gap:29px;align-items:center;font-size:12px;font-weight:700}.site-header nav a{text-decoration:none}.site-header nav a:hover{text-decoration:underline;text-underline-offset:5px}.hero{max-width:1480px;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) 274px;gap:50px;padding:65px 5% 63px;align-items:center}.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.7px;line-height:1.7;margin:0 0 24px}.hero .eyebrow{display:flex;align-items:center;gap:9px}.status-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}.hero-coordinate{margin-left:auto;font-size:9px;letter-spacing:.5px;color:var(--muted)}h1{font-size:clamp(55px,6.9vw,106px);line-height:.99;letter-spacing:-7px;margin:0 0 35px;font-weight:900}h1 span{font-family:Georgia,serif;font-style:italic;font-weight:400;letter-spacing:-6px}.hero-bottom{display:flex;justify-content:space-between;align-items:end;gap:24px}.hero-bottom p{font-size:13px;line-height:1.75;margin:0;color:var(--muted)}.primary-link{display:flex;justify-content:space-between;align-items:center;gap:25px;background:var(--ink);color:var(--paper);padding:17px 20px;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap}.primary-link span{font-size:20px}.primary-link:hover{background:#3e4133}.week-ticket{background:var(--acid);padding:23px 23px 18px;transform:rotate(4deg);position:relative;box-shadow:8px 9px 0 #1b1b1914;isolation:isolate}.week-ticket:before,.week-ticket:after{content:'';position:absolute;width:22px;height:22px;border-radius:50%;background:var(--paper);top:72%;z-index:1}.week-ticket:before{left:-11px}.week-ticket:after{right:-11px}.ticket-top{display:flex;justify-content:space-between;font-size:10px;font-weight:800;letter-spacing:1px;line-height:1.3}.ticket-arrow{font-size:29px;font-weight:400}.ticket-symbol{font-size:112px;line-height:1;margin:10px 0;text-align:center}.ticket-date{text-align:center;display:flex;flex-direction:column;gap:3px;padding-bottom:22px}.ticket-date span{font-size:9px;letter-spacing:2px;font-weight:700}.ticket-date strong{font-size:39px;letter-spacing:-2px;line-height:1.15}.ticket-bottom{padding-top:16px;border-top:1px dashed #7a8335;display:flex;justify-content:space-between;align-items:center;gap:18px}.ticket-bottom>span{font-size:8px;font-weight:700;letter-spacing:.7px;line-height:1.4}.barcode{height:28px;width:110px;background:repeating-linear-gradient(90deg,var(--ink) 0 1px,transparent 1px 3px,var(--ink) 3px 5px,transparent 5px 6px,var(--ink) 6px 7px,transparent 7px 11px)}.ticker{display:flex;justify-content:space-around;gap:30px;overflow:hidden;white-space:nowrap;padding:14px 5%;background:var(--ink);color:var(--acid);font-size:10px;font-weight:700;letter-spacing:2px}.ticker span:nth-child(even){font-size:18px;line-height:.65}.menu-status{max-width:1332px;margin:0 auto;padding:21px 0;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line);font-size:10px;color:var(--muted)}.menu-status>div{display:flex;align-items:center;gap:9px}.menu-status strong{font-size:10px;color:var(--ink)}.menu-status .status-dot{background:#65872a;width:6px;height:6px}.menu-status p{margin:0;line-height:1.6}.status-divider{color:#a5a599;margin:0 3px}.menu-status.status-warning .status-dot{background:#af4a18}.status-explanation{width:100%;color:#974512}.lineup-section{max-width:1480px;margin:0 auto;padding:62px 5% 77px}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:34px}.section-heading .eyebrow{margin-bottom:11px}h2{font-size:clamp(36px,4vw,57px);line-height:1.07;letter-spacing:-2.8px;margin:0;font-weight:800}h2 em{font-family:Georgia,serif;font-weight:400}.lineup-summary{font-size:12px;text-align:right;line-height:1.9;margin:0}.lineup-summary strong{font-size:16px}.lineup-summary>span:not(.small-note){padding:0 9px;color:#a5a599}.small-note{font-size:10px;color:var(--muted)}.filters{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:19px 0 14px}.filter-row{display:flex;justify-content:space-between;align-items:center;gap:18px}.category-tabs{display:flex;gap:5px;flex-wrap:wrap}.category-tabs button{border:1px solid transparent;background:none;font-size:12px;font-weight:700;padding:11px 16px;white-space:nowrap}.category-tabs button[aria-pressed=true]{background:var(--ink);color:var(--paper)}.category-tabs button:hover:not([aria-pressed=true]){background:#e9e8df}.category-tabs button span{background:var(--acid);color:var(--ink);font-size:9px;padding:2px 5px;margin-left:5px}.search-box{display:flex;align-items:center;gap:9px;min-width:250px;border-bottom:1px solid #9e9e93;padding:7px 0}.search-symbol{font-size:23px;line-height:1}.search-box input{background:transparent;border:0;min-width:0;width:100%;font-size:12px;padding:4px 0;border-radius:0}.search-box input::placeholder{color:#72736b}.days-row{display:flex;align-items:center;gap:18px;margin-top:18px}.filter-label{font-size:8px;font-weight:700;letter-spacing:1.5px;white-space:nowrap}.day-tabs{display:flex;gap:4px;flex-wrap:wrap}.day-tabs button{border:1px solid transparent;background:transparent;font-size:10px;padding:7px 12px;white-space:nowrap}.day-tabs button[aria-pressed=true]{background:var(--acid);border-color:var(--ink)}.day-tabs button:hover:not([aria-pressed=true]){border-color:var(--line)}.clear-button{margin-left:auto;background:none;border:0;font-size:10px;text-decoration:underline;text-underline-offset:4px;white-space:nowrap}.results-heading{display:flex;justify-content:space-between;gap:20px;color:var(--muted);font-size:10px;padding:18px 0 20px}.results-heading p{margin:0}.results-heading p:last-child{font-size:9px}.event-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px}.event-card{border:1px solid var(--line);padding:21px 22px 17px;background:#fcfaf5;display:flex;flex-direction:column;transition:border-color .15s,transform .15s;min-width:0}.event-card:hover{border-color:var(--ink);transform:translateY(-2px)}.card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.kind{text-transform:uppercase;letter-spacing:1.1px;font-size:8px;font-weight:700;padding:6px 8px;background:var(--purple)}.kind-day{background:var(--acid)}.kind-late{background:var(--orange)}.event-number{font-size:10px;color:#8a8b80;font-family:monospace}.event-date{font-size:10px;font-weight:700;margin:0 0 9px;display:flex;flex-wrap:wrap;gap:5px 8px}.recurring{color:var(--muted);font-weight:400;font-size:9px;width:100%;line-height:1.5}.event-card h3{font-size:27px;line-height:1.08;letter-spacing:-1px;margin:0 0 10px;overflow-wrap:anywhere}.venue{font-size:9px;font-weight:700;letter-spacing:.55px;line-height:1.5;margin:0 0 23px;color:#51534b}.entry{margin-top:auto;padding:16px 0 14px;border-top:1px solid var(--line)}.entry-label{font-size:7px;letter-spacing:1.4px;color:#77796c;font-weight:700}.entry p{font-size:11px;line-height:1.7;margin:7px 0 0;color:#4e5146}.source-link{display:flex;justify-content:space-between;gap:12px;font-size:10px;text-decoration:none;font-weight:700;padding-top:13px;border-top:1px solid var(--line)}.source-link span{font-size:16px}.source-link:hover{text-decoration:underline;text-underline-offset:4px}.empty-state{text-align:center;padding:65px 20px;border:1px dashed var(--line)}.empty-state>span{font-size:50px}.empty-state h3{font-size:24px;letter-spacing:-.8px}.empty-state p{font-size:13px;color:var(--muted)}.empty-state button{background:var(--ink);color:var(--paper);padding:13px 18px;border:0;font-size:12px;margin-top:12px}.before-section{background:var(--ink);color:var(--paper);padding:62px max(5%,calc((100% - 1332px)/2));display:grid;grid-template-columns:1fr 1fr;gap:90px}.before-intro .eyebrow{color:var(--acid);margin-bottom:17px}.before-intro h2{font-size:48px}.before-intro>p:not(.eyebrow){font-size:12px;line-height:1.8;color:#bdbeb2;max-width:380px;margin:22px 0}.before-intro>a{color:var(--acid);font-size:11px;text-underline-offset:6px;line-height:2}.before-rules>div{display:grid;grid-template-columns:27px 1fr;column-gap:15px;padding:22px 0;border-bottom:1px solid #494a41}.before-rules>div:first-child{padding-top:4px}.before-rules>div:last-child{border:0;padding-bottom:0}.before-rules span{font-size:11px;font-family:monospace;color:var(--acid);grid-row:span 2;line-height:1.6}.before-rules h3{font-size:17px;font-weight:700;margin:0 0 9px;letter-spacing:-.2px}.before-rules p{font-size:11px;line-height:1.75;margin:0;color:#bdbeb2}.source-notes{max-width:1480px;padding:59px 5%;margin:auto;display:grid;grid-template-columns:1fr 1fr;gap:90px}.source-notes .eyebrow{margin-bottom:15px}.source-notes h2{font-size:36px;letter-spacing:-1.5px}.source-notes>div>p:last-child{font-size:12px;color:var(--muted);line-height:1.6}.source-section{border-bottom:1px solid var(--line)}.source-section summary{padding:20px 0;font-size:11px;font-weight:700;letter-spacing:1px;display:flex;justify-content:space-between;gap:20px;list-style:none}.source-section summary::-webkit-details-marker{display:none}.source-section summary span{font-size:20px;font-weight:400;line-height:.7}.source-section[open] summary span{transform:rotate(45deg)}.source-section>div{padding-bottom:17px;overflow-wrap:anywhere}.source-section p{font-size:11px;line-height:1.8;color:var(--muted)}footer{border-top:1px solid var(--line);max-width:1480px;padding:35px 5%;margin:auto;display:flex;justify-content:space-between;gap:40px;align-items:start}.footer-brand{font-size:20px;font-weight:900;letter-spacing:-1px;text-decoration:none;display:flex;align-items:center;gap:12px}.footer-brand span{font-size:28px}.footer-brand+p{font-size:9px;color:var(--muted);line-height:1.8;margin-top:14px}.footer-links{display:grid;grid-template-columns:1fr 1fr;gap:20px 30px;margin-top:5px}.footer-links a{font-size:10px;font-weight:700;text-decoration:none}.footer-links a:hover{text-decoration:underline}.footer-signoff{font-size:10px;letter-spacing:1.8px;line-height:1.5;font-weight:800;margin:5px 0}.no-script{font-size:12px;color:var(--muted)}
@media(min-width:1480px){.menu-status{padding-left:0;padding-right:0}}
@media(max-width:1479px){.menu-status{margin-left:5%;margin-right:5%}}
@media(max-width:1000px){.hero{gap:30px;grid-template-columns:minmax(0,1fr) 220px;padding-top:48px;padding-bottom:48px}h1{font-size:70px;letter-spacing:-4.4px}h1 span{letter-spacing:-4px}.hero-coordinate{display:none}.ticket-symbol{font-size:80px}.ticket-date strong{font-size:33px}.hero-bottom{align-items:start;flex-direction:column;gap:20px}.primary-link{padding:13px 17px}.event-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.before-section,.source-notes{gap:45px}.search-box{min-width:210px}.category-tabs button{padding:11px 10px}.site-header nav{gap:18px}.brand-note{display:none}}
@media(max-width:700px){.site-header{padding:20px 5%;gap:18px}.wordmark{font-size:20px;letter-spacing:-1px;gap:6px}.brand-mark{font-size:29px}.site-header nav{gap:0}.hero{padding:38px 5% 40px;grid-template-columns:minmax(0,1fr) 143px;gap:13px;align-items:end}.hero .eyebrow{font-size:8px;letter-spacing:1px;margin-bottom:20px;white-space:nowrap}h1{font-size:clamp(41px,7.5vw,53px);letter-spacing:-2.7px;line-height:1.06;margin-bottom:21px}h1 span{letter-spacing:-2.4px}.hero-bottom p{font-size:10px;line-height:1.7;max-width:230px}.hero-bottom p br{display:none}.hero-bottom{gap:20px}.primary-link{font-size:10px;padding:11px 14px;gap:16px}.primary-link span{font-size:17px}.week-ticket{padding:13px 12px 12px;margin-bottom:11px;box-shadow:5px 5px 0 #1b1b1914}.ticket-top{font-size:7px;letter-spacing:.6px}.ticket-arrow{font-size:22px}.ticket-symbol{font-size:64px;margin:7px 0}.ticket-date{padding-bottom:14px;gap:4px}.ticket-date strong{font-size:26px;letter-spacing:-1.4px}.ticket-date span{font-size:6px;letter-spacing:1.5px}.ticket-bottom{padding-top:11px;gap:5px}.ticket-bottom>span{font-size:5px;letter-spacing:.2px}.barcode{width:58px;height:20px}.week-ticket:before,.week-ticket:after{width:14px;height:14px;top:76%}.week-ticket:before{left:-7px}.week-ticket:after{right:-7px}.ticker{justify-content:start;gap:23px;padding:12px 5%;font-size:8px;letter-spacing:1.6px}.ticker span:nth-child(even){font-size:15px}.menu-status{padding:17px 0;align-items:start;gap:8px;font-size:8px}.menu-status>div{flex-wrap:wrap;gap:6px}.menu-status strong{font-size:9px}.menu-status p{font-size:8px}.lineup-section{padding-top:38px;padding-bottom:40px}.section-heading{align-items:start;margin-bottom:24px;gap:15px}.section-heading .eyebrow{font-size:8px;margin-bottom:9px}h2{font-size:35px;letter-spacing:-1.7px}.lineup-summary{font-size:9px;padding-top:22px;white-space:nowrap}.lineup-summary strong{font-size:12px}.lineup-summary>span:not(.small-note){padding:0 4px}.small-note{display:none}.filter-row{flex-direction:column;align-items:stretch;gap:15px}.category-tabs{gap:0;justify-content:space-between}.category-tabs button{font-size:10px;padding:10px}.category-tabs button span{font-size:8px;padding:2px 4px;margin-left:3px}.search-box{width:100%;padding:9px 4px;background:#ebeae2;border:1px solid var(--line);gap:9px;min-width:0}.search-box input{font-size:11px}.search-symbol{margin-left:8px}.days-row{gap:9px;align-items:start;flex-wrap:wrap;margin-top:15px}.filter-label{width:100%;font-size:7px}.day-tabs{gap:2px;justify-content:space-between;width:100%}.day-tabs button{font-size:9px;padding:7px 8px}.clear-button{margin:6px 0 0;font-size:9px}.results-heading{padding:16px 0;font-size:9px}.results-heading p:last-child{display:none}.event-grid{gap:12px}.event-card{padding:15px 14px 13px}.card-top{margin-bottom:20px}.kind{font-size:6px;padding:5px 6px;letter-spacing:.6px}.event-number{font-size:8px}.event-date{font-size:8px;line-height:1.4;margin-bottom:8px}.recurring{font-size:7px}.event-card h3{font-size:22px;letter-spacing:-.8px}.venue{font-size:7px;letter-spacing:.3px;margin-bottom:17px}.entry{padding:13px 0 12px}.entry-label{font-size:6px}.entry p{font-size:9px;line-height:1.7}.source-link{font-size:8px;padding-top:10px}.source-link span{font-size:13px}.before-section{padding-top:39px;padding-bottom:39px;grid-template-columns:1fr;gap:30px}.before-intro h2{font-size:39px}.before-intro .eyebrow{font-size:8px}.before-intro>p:not(.eyebrow){font-size:11px;max-width:100%}.before-rules h3{font-size:16px}.before-rules p{font-size:10px}.source-notes{padding-top:39px;padding-bottom:39px;grid-template-columns:1fr;gap:15px}.source-notes .eyebrow{font-size:8px}.source-notes h2{font-size:31px}.source-notes>div>p:last-child{font-size:11px}.source-section summary{font-size:10px}.source-section p{font-size:10px}footer{padding-top:27px;padding-bottom:27px;flex-wrap:wrap;gap:25px}.footer-brand{font-size:19px}.footer-brand+p{font-size:8px}.footer-links{gap:17px 22px}.footer-links a{font-size:9px}.footer-signoff{display:none}.empty-state{padding:40px 17px}.empty-state h3{font-size:22px}.empty-state p{font-size:11px}}
@media(max-width:700px){.event-grid{grid-template-columns:1fr;gap:15px}.event-card{padding:22px 22px 19px}.kind{font-size:8px;padding:7px 9px;letter-spacing:.9px}.event-number{font-size:10px}.event-date{font-size:11px;line-height:1.5}.recurring{font-size:10px}.event-card h3{font-size:29px;letter-spacing:-.9px;overflow-wrap:normal}.venue{font-size:10px;letter-spacing:.4px;margin-bottom:22px}.entry{padding:17px 0}.entry-label{font-size:8px}.entry p{font-size:13px;line-height:1.75}.source-link{font-size:11px;padding-top:15px;min-height:35px;align-items:center}.source-link span{font-size:17px}.category-tabs button{min-height:44px}.day-tabs button{min-height:36px}.search-box{min-height:42px}}
@media(max-width:380px){.hero{grid-template-columns:minmax(0,1fr) 118px;gap:9px}h1{font-size:37px;letter-spacing:-2.4px}h1 span{letter-spacing:-2.1px}.ticket-date strong{font-size:23px}.ticket-symbol{font-size:54px}.ticket-top{font-size:6px}.ticket-bottom>span{display:none}.ticket-bottom{justify-content:center}.brand-mark{font-size:26px}.wordmark{font-size:18px}.event-grid{grid-template-columns:1fr}.event-card h3{font-size:27px}.entry p{font-size:13px}.event-date,.venue,.source-link{font-size:11px}.kind{font-size:8px}.day-tabs button{padding:7px 6px}}
@media(max-width:700px){.category-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px}.category-tabs button{text-align:left;padding:12px 14px}}
footer{flex-wrap:wrap;row-gap:24px}.personal-credit{flex-basis:100%;margin:0;padding:18px 0 0;border-top:1px solid var(--line);text-align:left;color:var(--muted);font-size:11px;line-height:1.6}.personal-credit a{text-underline-offset:4px}.dj-profile{margin:0 0 20px;background:#eeeaf7;padding:14px;border:1px solid #d8d1e5;text-align:left}.artist-link{text-decoration:none}.artist-link:hover{text-decoration:underline;text-underline-offset:5px}.artist-link:focus-visible,.dj-details:focus-visible{outline:2px solid currentColor;outline-offset:4px}.dj-details{display:inline-block;font-size:11px;font-weight:700;line-height:1.6;margin-top:12px;text-underline-offset:3px}.dj-rank{font-size:10px;text-decoration:none;display:flex;width:fit-content;gap:9px;align-items:center;white-space:nowrap}.dj-rank strong{font-size:20px;letter-spacing:-.5px}.dj-from,.dj-known{font-size:12px;line-height:1.65;margin:10px 0 0;text-align:left;overflow-wrap:anywhere}@media(max-width:700px){.dj-profile{padding:16px}.dj-details{font-size:12px}.dj-rank{font-size:11px}}

.dress-items h3{font-size:12px;margin:18px 0 7px}.dress-items p{margin:0}.dress-items strong{color:var(--ink)}.dress-source{display:inline-block;font-size:11px;font-weight:700;text-underline-offset:4px;margin-top:20px}.dress-code .dress-observed{font-size:10px;margin-bottom:0}@media(max-width:700px){.dress-code p{font-size:12px;line-height:1.8}.dress-items h3{font-size:13px}.dress-source{font-size:12px;line-height:1.8}}
.calendar-coverage{max-width:1332px;margin:0 5%;padding:18px 0;border-bottom:1px solid var(--line);font-size:11px;line-height:1.7;color:var(--muted)}.calendar-coverage>strong{color:var(--ink);margin-right:18px}.calendar-coverage p{margin:6px 0 0}.calendar-coverage a{text-underline-offset:3px}.calendar-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-top:20px}.period-tabs{display:flex;flex-wrap:wrap;gap:5px}.period-tabs button{border:1px solid var(--line);background:transparent;padding:9px 13px;font-size:11px}.period-tabs button[aria-pressed=true]{background:var(--acid);border-color:var(--ink)}.date-choice{position:relative;display:flex;align-items:center;gap:10px;font-size:10px;color:var(--muted)}.date-choice button{background:var(--paper);color:var(--ink);border:1px solid var(--line);padding:9px;font:inherit}.date-choice #calendar-date{font-size:12px;min-height:42px}.calendar-panel{position:absolute;right:0;top:calc(100% + 6px);z-index:5;width:min(20rem,90vw);padding:8px;background:var(--paper);color:var(--ink);border:1px solid var(--ink);box-shadow:3px 3px var(--line)}.calendar-panel[hidden]{display:none}.calendar-month-row{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;text-align:center;gap:4px;font-size:13px;margin-bottom:6px}.calendar-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;text-align:center}.calendar-days button,.calendar-month-row button{min-height:38px;padding:2px;font-size:13px}.calendar-days button[aria-pressed=true]{background:var(--acid);border-color:var(--ink)}.calendar-days button[aria-current=date]{font-weight:700}.date-choice button:disabled{opacity:.45;cursor:default}.calendar-weekday{padding:4px 0}#calendar-clear-date{margin-top:7px;padding:8px;min-height:38px;font-size:12px}.date-filter-note{font-size:10px;color:var(--muted);line-height:1.6;margin:12px 0 0}.advance-listing{font-size:9px;font-weight:400;color:#696254;line-height:1.5;width:100%}@media(max-width:700px){.calendar-row{gap:12px}.period-tabs{width:100%;display:grid;grid-template-columns:repeat(2,1fr)}.period-tabs button{min-height:42px;padding:10px;text-align:left}.date-choice{width:100%;justify-content:space-between}.calendar-coverage>strong,.calendar-coverage>span{display:block}.advance-listing{font-size:10px}}
.venue-link{text-decoration-line:underline;text-decoration-style:dotted;text-underline-offset:4px;overflow-wrap:anywhere}.venue-link:hover{text-decoration-style:solid}.venue-link:focus-visible{outline:2px solid currentColor;outline-offset:4px}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.event-card{transition:none}.event-card:hover{transform:none}}
.site-header nav:not(.language-links){margin-left:auto}
.site-header .language-links{flex-wrap:wrap;gap:8px;justify-content:flex-end}
.site-header .language-links .locale-link{display:inline-block;white-space:nowrap;border:1px solid var(--line);padding:9px 10px}
#filter-error{margin:12px 0 0;font-size:11px;line-height:1.6;color:#974512}
:lang(zh-CN) h1,:lang(zh-CN) h1 span,:lang(zh-CN) h2{letter-spacing:normal}
:lang(zh-CN) h1{font-size:clamp(52px,6vw,94px);line-height:1.1}
:lang(zh-CN) h1 span{font-style:normal}
@media(max-width:700px){
  .site-header{gap:10px}
  .site-header nav:not(.language-links){display:none}
  .site-header .language-links .locale-link{font-size:11px;padding:9px 7px}
  :lang(zh-CN) h1{font-size:clamp(28px,8.5vw,51px)}
  :lang(zh-CN) .section-heading{flex-direction:column;gap:8px}
  :lang(zh-CN) .lineup-summary{padding-top:0;white-space:normal;text-align:left}
}
`;
