import { createFormatters, createTranslator, DEFAULT_LOCALE } from './messages.js';

export const CATALOG_URL = 'https://yuxiaoli.github.io/djmag-data/';
const ARRIVAL_NOTE = /\s*(\(\s*(?:0?[1-9]|1[0-2])(?::?[0-5]\d)?\s*(?:am|pm)\s+arrival!?\s*\))\s*$/i;
const defaultT = createTranslator();
const defaultFormat = createFormatters();

// Case/spacing normalization only. Remove only the menu's explicit arrival-time note,
// never a generic parenthetical, a DJ prefix, a genre, a collaborator or a partial name.
export function artistKey(value) {
  return String(value || '').normalize('NFKC')
    .replace(ARRIVAL_NOTE, '')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}
export function matchArtist(description, profiles = []) {
  const key = artistKey(description);
  if (!key) return null;
  const matches = profiles.filter(profile => artistKey(profile.name) === key);
  return matches.length === 1 ? matches[0] : null;
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function localizedDetailUrl(detailUrl, locale) {
  const url = new URL(detailUrl);
  // DJ Mag Data gives an explicit query value priority over its browser preference.
  url.searchParams.set('lang', locale === 'zh-CN' ? locale : 'en');
  return url.href;
}

export function renderArtistHeading(description, catalog, { t = defaultT, locale = DEFAULT_LOCALE } = {}) {
  const dj = matchArtist(description, catalog?.profiles);
  if (!dj) return escape(description || t('card.artistUnknown'));
  const original = String(description);
  const noteStart = original.match(ARRIVAL_NOTE)?.index ?? original.length;
  return `<a class="artist-link" href="${escape(localizedDetailUrl(dj.detailUrl, locale))}" target="_blank" rel="noopener noreferrer">${escape(original.slice(0, noteStart))}</a>${escape(original.slice(noteStart))}`;
}
// Presentation-only emphasis reviewed against this exact sourced sentence. If the
// record changes, retain plain text rather than guess which words are significant.
export function renderKnownFor(dj) {
  const text = dj.bestKnownFor || '';
  const reviewed = 'Working with artists like Calvin Harris, Swedish House Mafia, Usher, and David Guetta.';
  if (dj.id !== 'alesso' || text !== reviewed) return escape(text);
  return text.split(/(Calvin Harris|Swedish House Mafia|Usher|David Guetta)/)
    .map((part, index) => index % 2 ? `<strong>${escape(part)}</strong>` : escape(part)).join('');
}
export function renderDJProfile(description, catalog, { t = defaultT, format = defaultFormat, locale = DEFAULT_LOCALE } = {}) {
  const dj = matchArtist(description, catalog?.profiles);
  if (!dj) return '';
  const rank = format.number(dj.rank);
  const year = format.number(dj.year, { useGrouping: false });
  const profileLabel = t('card.djProfile', { artist: dj.name });
  const rankLabel = t('card.djRank', { artist: dj.name, rank, year });
  return `<aside class="dj-profile" aria-label="${escape(profileLabel)}"><a class="dj-rank" href="${escape(dj.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(rankLabel)}">DJ MAG ${escape(year)} <strong>#${escape(rank)}</strong></a>${dj.origin ? `<p class="dj-from">${escape(t('card.djFrom'))} <strong lang="en">${escape(dj.origin)}</strong></p>` : ''}${dj.bestKnownFor ? `<p class="dj-known" lang="en">${renderKnownFor(dj)}</p>` : ''}<a class="dj-details" href="${escape(localizedDetailUrl(dj.detailUrl, locale))}" target="_blank" rel="noopener noreferrer">${escape(t('card.djLink'))}</a></aside>`;
}
