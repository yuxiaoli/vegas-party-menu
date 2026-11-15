export const CATALOG_URL = 'https://yuxiaoli.github.io/djmag-data/';
const ARRIVAL_NOTE = /\s*(\(\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\s+arrival!?\s*\))\s*$/i;

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
const PROFILE_ARROW = '<svg class="dj-link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 17 17 7M7 7h10v10"/></svg>';
export function renderArtistHeading(description, catalog) {
  const dj = matchArtist(description, catalog?.profiles);
  if (!dj) return escape(description || 'See source menu');
  return `<a class="artist-link" href="${escape(dj.detailUrl)}" target="_blank" rel="noopener noreferrer">${escape(dj.name)}</a>`;
}
export function renderArrivalNote(description, catalog) {
  if (!matchArtist(description, catalog?.profiles)) return '';
  const note = String(description || '').match(ARRIVAL_NOTE)?.[1];
  return note ? `<p class="arrival-note">${escape(note)}</p>` : '';
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
export function renderDJProfile(description, catalog) {
  const dj = matchArtist(description, catalog?.profiles);
  if (!dj) return '';
  return `<aside class="dj-profile" aria-label="DJ profile for ${escape(dj.name)}"><a class="dj-rank" href="${escape(dj.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(dj.name)}, number ${dj.rank} in DJ Mag ${dj.year}">DJ MAG ${dj.year} <strong>#${dj.rank}</strong></a>${dj.origin ? `<p class="dj-from">From <strong>${escape(dj.origin)}</strong></p>` : ''}${dj.bestKnownFor ? `<p class="dj-known">${renderKnownFor(dj)}</p>` : ''}<a class="dj-details" href="${escape(dj.detailUrl)}" target="_blank" rel="noopener noreferrer">View DJ profile ${PROFILE_ARROW}</a></aside>`;
}
