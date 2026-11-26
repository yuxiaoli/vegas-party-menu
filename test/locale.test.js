import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { createFormatters, createTranslator } from '../src/messages.js';
import { filterMenu } from '../src/calendar-filters.js';
import { getFreshnessStatus } from '../src/freshness.js';
import { renderSite } from '../src/site.js';

const now = new Date('2026-11-16T07:59:00Z');
const event = {
  id: 'source-event-id',
  section: 'Nightclubs',
  venue: 'OMNIA @CAESARS PALACE',
  description: 'Alesso',
  dateText: 'Sunday, 11/15',
  details: 'Girls and guys free with very early arrival',
  eventDate: '2026-11-15',
  weekEnding: '2026-11-15',
};
const menu = {
  sourceUrl: 'https://example.com/original-menu',
  weekEnding: event.weekEnding,
  fetchedAt: now.toISOString(),
  events: [event],
  sections: [],
};
const calendar = { menus: [{}], fetchedAt: now.toISOString() };

test('Pages renders both languages with the same source records, filter IDs, and shared assets', () => {
  const snapshot = { source: 'github_pages_snapshot' };
  const en = load(renderSite(menu, snapshot, now, null, null, calendar, {
    siteRoot: './', clientScript: './assets/menu.js'
  }));
  const zh = load(renderSite(menu, snapshot, now, null, null, calendar, {
    locale: 'zh-CN', siteRoot: '../', clientScript: '../assets/menu.js'
  }));
  const t = createTranslator('zh-CN');
  assert.equal(en('html').attr('lang'), 'en');
  assert.equal(zh('html').attr('lang'), 'zh-CN');
  assert.equal(zh('title').text(), t('page.title'));
  assert.equal(en('[data-locale-link="zh-CN"]').attr('href'), './zh-CN/');
  assert.equal(zh('[data-locale-link="en"]').attr('href'), '../?lang=en');
  assert.equal(zh('script[type="module"]').attr('src'), '../assets/menu.js');
  assert.equal(zh('link[type="application/rss+xml"]').attr('href'), '../rss.xml');
  assert.equal(zh('a[href="../data/calendar.json"]').length, 1);
  assert.equal(zh('.site-header a').filter((_, link) => zh(link).attr('href') === menu.sourceUrl).length, 0);
  assert.equal(zh('.before-intro > a').attr('href'), menu.sourceUrl);
  assert.equal(zh('.event-card').attr('data-event-id'), event.id);
  assert.equal(zh('.event-card').attr('data-category'), event.section);
  assert.equal(zh('.kind').text(), t('category.Nightclubs'));
  assert.equal(zh('.event-card h3').text(), event.description);
  assert.equal(zh('.venue').text(), event.venue);
  assert.equal(en('.entry > p').text(), event.details);
  assert.match(zh('.entry > p').first().text(), /免费/);
  assert.match(zh('.entry > p').first().text(), /提早|提前|早到/);
  assert.equal(zh('.entry > p').length, 1);
  assert.equal(zh('.entry details, .entry button, .entry [lang="en"]').length, 0);
  assert.doesNotMatch(zh('.entry').text(), /查看英文原文|Girls and guys free/);
  assert.ok(zh('.event-card').attr('data-search').includes(event.details));
  assert.equal(zh('.event-date time').attr('datetime'), event.eventDate);
  assert.match(zh('.event-date time').text(), /2026年11月15日/);
  assert.ok(!zh('.event-date').text().includes(event.dateText));
  assert.ok(zh('.event-card').attr('data-search').includes(event.dateText));
  assert.equal(zh('[data-day="Sunday"]').attr('aria-label'), t('day.Sunday'));
  assert.equal(zh('[data-period="This week"]').text(), t('period.This week'));
  assert.equal(zh('button#calendar-date').text(), '选择日期');
  assert.equal(zh('#filter-error').text(), t('filter.invalid'));
});

test('locale fallback and formatters keep the Las Vegas date across midnight', () => {
  const format = createFormatters('zh-CN');
  assert.equal(createTranslator('unsupported')('period.This week'), 'This week');
  assert.equal(format.number(1234), '1,234');
  assert.equal(format.timestamp(now, { dateStyle: 'long' }), '2026年11月15日');
  const midnight = new Date('2026-11-16T08:00:00Z');
  assert.equal(format.timestamp(midnight, { dateStyle: 'long' }), '2026年11月16日');
  assert.equal(getFreshnessStatus(menu.weekEnding, { now, calendar: true }).key, 'current');
  assert.equal(getFreshnessStatus(menu.weekEnding, { now: midnight, calendar: true }).key, 'older');
  assert.equal(getFreshnessStatus(null, { now, calendar: true }).key, 'unknown');
});

test('Chinese cards refer to the source when a condition cannot be translated in full', () => {
  const unfamiliar = 'Present a flyer with a <silver star>';
  const partial = `Girls and guys free. ${unfamiliar}`;
  const listingMenu = { ...menu, events: [{ ...event, details: partial }, { ...event, details: unfamiliar }] };
  const html = renderSite(listingMenu, { source: 'github_pages_snapshot' }, now, null, null, null, { locale: 'zh-CN' });
  const zh = load(html);
  const expected = createTranslator('zh-CN')('card.entryCheckSource');
  assert.deepEqual(zh('.entry p').map((_, entry) => zh(entry).text()).get(), [expected, expected]);
  assert.equal(zh('.entry details, .entry button, .entry [lang="en"]').length, 0);
  assert.ok(zh('.event-card').first().attr('data-search').includes(partial));
  assert.ok(zh('.event-card').last().attr('data-search').includes(unfamiliar));
  assert.ok(html.includes('&lt;silver star&gt;'));
});

test('Chinese cards localize recurring weekdays and source date warnings', () => {
  const warning = 'Explicit event date is outside the advertised week-ending window';
  const listingMenu = {
    ...menu,
    events: [
      { ...event, dateWarnings: [warning] },
      { ...event, eventDate: null, dateText: 'Thursday - Sunday' },
    ],
  };
  const zh = load(renderSite(listingMenu, { source: 'github_pages_snapshot' }, now, null, null, calendar, { locale: 'zh-CN' }));
  assert.match(zh('.event-date').first().text(), /活动的具体日期超出来源标注的周次/);
  assert.doesNotMatch(zh('.event-date').first().text(), /Explicit event date/);
  assert.match(zh('.event-date').last().text(), /周四至周日/);
  assert.doesNotMatch(zh('.event-date').last().text(), /Thursday - Sunday/);
});

test('search accepts original text and bilingual labels independently of the selected UI language', () => {
  const record = { ...event, days: ['Sunday'], search: `${event.description} ${event.venue} ${event.details}` };
  const t = createTranslator('zh-CN');
  for (const query of ['ＡＬＥＳＳＯ', 'omnia', 'free', 'nightclubs', 'Sunday', t('category.Nightclubs'), t('day.Sunday')]) {
    assert.deepEqual(filterMenu([record], { query }), [record]);
  }
  assert.deepEqual(filterMenu([record], { query: t('day.Tuesday') }), []);
  assert.deepEqual(filterMenu([record], { query: t('category.Nightclubs'), day: 'Monday' }), []);
});

test('Pages can deliver its filter controller in the same response in both locales', () => {
  const bundle = 'const example = "</ScRiPt><div>";';
  for (const [locale, siteRoot] of [['en', './'], ['zh-CN', '../']]) {
    const $ = load(renderSite(menu, { source: 'github_pages_snapshot' }, now, null, null, calendar, {
      locale, siteRoot, clientBundle: bundle,
    }));
    const script = $('script[type="module"]');
    assert.equal(script.length, 1);
    assert.equal(script.attr('src'), undefined);
    assert.equal(script.html(), bundle.replace('/', '\\/'));
    assert.equal($('button#calendar-date').length, 1);
    assert.equal($('a[href="' + siteRoot + 'data/calendar.json"]').length, 1);
  }
});
