export const CATALOG_URL = 'https://yuxiaoli.github.io/djmag-data/';

// Case/spacing normalization only. Remove only the menu's explicit arrival-time note,
// never a generic parenthetical, a DJ prefix, a genre, a collaborator or a partial name.
export function artistKey(value) {
  return String(value || '').normalize('NFKC')
    .replace(/\s*\(\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\s+arrival!?\s*\)\s*$/i, '')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}
export function matchArtist(description, profiles = []) {
  const key = artistKey(description);
  if (!key) return null;
  const matches = profiles.filter(profile => artistKey(profile.name) === key);
  return matches.length === 1 ? matches[0] : null;
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function renderDJProfile(description, catalog) {
  const dj = matchArtist(description, catalog?.profiles);
  if (!dj) return '';
  return `<aside class="dj-profile" aria-label="DJ profile for ${escape(dj.name)}"><a class="dj-name" href="${escape(dj.detailUrl)}" target="_blank" rel="noopener noreferrer">${escape(dj.name)}</a><a class="dj-rank" href="${escape(dj.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(dj.name)}, number ${dj.rank} in DJ Mag ${dj.year}">DJ MAG ${dj.year} <strong>#${dj.rank}</strong></a>${dj.origin ? `<p class="dj-from">From ${escape(dj.origin)}</p>` : ''}${dj.bestKnownFor ? `<p class="dj-known">${escape(dj.bestKnownFor)}</p>` : ''}</aside>`;
}
