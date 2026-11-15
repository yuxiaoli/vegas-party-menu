import { test } from 'node:test';
import { load } from 'cheerio';
import assert from 'node:assert/strict';
import menu from '../data/menu.json' with { type: 'json' };
import { renderSite, eventDays } from '../src/site.js';

const current = { source: 'github', remoteRead: 'ok' };
const now = new Date('2026-11-10T12:00:00Z');

test('home renders every source event, source link and existing API links', () => {
  const html = renderSite(menu, current, now);
  assert.equal((html.match(/<article class="event-card"/g) || []).length, menu.events.length);
  for (const path of ['/api/menu', '/rss.xml', '/openapi.json']) assert.ok(html.includes(`href="${path}"`));
  assert.ok(html.includes(menu.sourceUrl));
  assert.match(html, /Current menu week/);
  assert.match(html, /Not affiliated with the original publisher or venues/);
});

test('day matching supports single days, ranges and wraparound without inventing dates', () => {
  assert.deepEqual(eventDays('Friday, 11/13'), ['Friday']);
  assert.deepEqual(eventDays('Thursday - Sunday'), ['Thursday', 'Friday', 'Saturday', 'Sunday']);
  assert.deepEqual(eventDays('Friday - Monday'), ['Friday', 'Saturday', 'Sunday', 'Monday']);
  assert.equal(eventDays('Monday - Sunday').length, 7);
  assert.deepEqual(eventDays(null), []);
  assert.deepEqual(eventDays('TBC'), []);
});

test('home clearly labels recurring entries without specific dates', () => {
  const html = renderSite(menu, current, now);
  const count = menu.events.filter(event => !/\d{1,2}\/\d{1,2}/.test(event.dateText || '')).length;
  assert.equal((html.match(/Recurring · dates not specified/g) || []).length, count);
});

test('home explicitly reports fallback, outdated and unknown menu weeks', () => {
  assert.match(renderSite(menu, { source: 'bundled_fallback', remoteRead: 'failed' }, now), /Backup snapshot/);
  assert.match(renderSite({ ...menu, weekEnding: '2026-11-08' }, current, now), /Past menu week/);
  assert.match(renderSite({ ...menu, weekEnding: null }, current, now), /Menu date unknown/);
  assert.match(renderSite({ ...menu, weekEnding: null }, current, now), /Collection time does not establish event dates/);
});

test('home escapes source strings in text and HTML attributes', () => {
  const malicious = '<img src=x onerror="alert(1)">';
  const data = { ...menu, events: [{ section: 'Nightclubs', venue: malicious, description: malicious, details: malicious, dateText: 'Friday' }], sections: [{ title: malicious, blocks: [malicious] }] };
  const html = renderSite(data, current, now);
  assert.ok(!html.includes(malicious));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
});

test('home retains non-event source sections and useful no-JavaScript content', () => {
  const html = renderSite(menu, current, now);
  assert.match(html, /STRIP CLUB DEALS/);
  assert.match(html, /UPCOMING EVENTS/);
  assert.match(html, /<noscript>/);
  assert.match(html, /id="filters" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /prefers-reduced-motion/);
});


test('Vegas Parties branding replaces the source name throughout the page', () => {
  const $ = load(renderSite(menu, current, now));
  assert.equal($('title').text(), 'Vegas Parties · Your weekly party menu');
  assert.match($('.wordmark').text(), /VEGAS PARTIES/);
  assert.match($('.footer-brand').text(), /VEGAS PARTIES/);
  assert.equal($('#hero-title').text(), 'Your week.In Vegas.');
  assert.doesNotMatch($('.wordmark, .hero, .event-card, footer').text(), /saint/i);
  assert.match($('#dress-code').text(), /Half Saint/); // Required source attribution, not site branding.
  for (const element of $('meta[content], [aria-label], [title]').toArray()) {
    for (const attribute of ['content', 'aria-label', 'title']) {
      assert.doesNotMatch($(element).attr(attribute) || '', /saint/i);
    }
  }
  assert.equal($('meta[property="og:title"]').attr('content'), $('title').text());
  assert.equal($('link[rel="alternate"]').attr('href'), '/rss.xml');
  assert.equal($('.nav-source').attr('href'), menu.sourceUrl);
  assert.equal($('.source-link').length, 0);
  assert.doesNotMatch($('.event-card').text(), /Check original menu/);
  assert.equal($('.event-card').length, menu.events.length);
});


test('personal credit is integrated into the light footer with its exact author link', () => {
  const html = renderSite(menu, current, now), $ = load(html), credit = $('footer > .personal-credit');
  assert.equal(credit.length, 1);assert.equal(credit.text(), 'Built by Sean with ❤️');
  assert.equal(credit.find('a').length, 1);assert.equal(credit.find('a').text(), 'Sean');
  assert.equal(credit.find('a').attr('href'), 'https://www.linkedin.com/in/yuxiaoli/');
  const rule = html.match(/\.personal-credit\{([^}]+)\}/)[1];
  assert.match(rule, /border-top:1px solid var\(--line\)/);assert.match(rule, /color:var\(--muted\)/);
  assert.doesNotMatch(rule, /background:var\(--ink\)/);assert.match(rule, /text-align:left/);
});

test('dress code is an attributed concise guide, not invented venue rules or modified menu data', () => {
  const html = renderSite(menu, current, now), $ = load(html), section = $('#dress-code');
  assert.equal(section.length, 1);assert.equal(section.find('h3').length, 3);
  assert.equal(section.closest('.source-notes').length, 1);assert.equal(section[0].name, 'details');assert.equal(section.attr('open'), undefined);
  assert.deepEqual($('.source-details > details > summary').map((_,e)=>$(e).text().replace(/\s*\+$/, '').trim()).get(), ['LINKS','STRIP CLUB DEALS','UPCOMING EVENTS','DRESS CODE']);
  assert.equal(section.find('.dress-source').attr('href'), 'https://halfsaintvegas.com/pages/vegas-dress-code');
  assert.match(section.text(), /Half Saint/);assert.match(section.text(), /venue-specific requirements/);
  assert.match(section.text(), /essential medication/);assert.match(section.text(), /Source checked November 15, 2026/);
  assert.ok(section.text().split(/\s+/).length <= 200);
  assert.equal($('.event-card').length, menu.events.length);
  $('.event-card').each((i, card) => assert.equal($(card).find('.entry p').text(), menu.events[i].details));
});
