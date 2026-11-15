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
  const facts = [dj.origin && `<div><dt>From</dt><dd>${escape(dj.origin)}</dd></div>`, dj.styles?.length && `<div><dt>Style</dt><dd>${escape(dj.styles.join(', '))}</dd></div>`, dj.bestKnownFor && `<div><dt>Known for</dt><dd>${escape(dj.bestKnownFor)}</dd></div>`].filter(Boolean).join('');
  return `<aside class="dj-profile" aria-label="DJ profile for ${escape(dj.name)}"><div class="dj-profile-heading"><span class="dj-profile-label">KNOW THE DJ</span><a class="dj-rank" href="${escape(dj.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(dj.name)}, number ${dj.rank} in DJ Mag ${dj.year}">DJ MAG ${dj.year} <strong>#${dj.rank}</strong></a></div><p class="dj-name">${escape(dj.name)}</p>${dj.description ? `<p class="dj-description">${escape(dj.description)}</p>` : ''}${facts ? `<dl class="dj-facts">${facts}</dl>` : ''}<a class="dj-detail" href="${escape(dj.detailUrl)}" target="_blank" rel="noopener noreferrer">View DJ profile <span aria-hidden="true">↗</span></a><p class="dj-observed">Catalog record updated ${escape(String(dj.observedAt).slice(0,10))}. Annual poll, not a daily ranking.</p></aside>`;
}
export function renderCatalogNote(catalog) {
  if (!catalog) return '';
  const status = catalog.status === 'unavailable' ? 'DJ profiles are temporarily unavailable. The source menu is still shown in full.' : `${catalog.matchedListingCount} listings with DJ profiles${catalog.year ? ` · DJ Mag ${catalog.year}` : ''}.${catalog.status === 'partial' ? ' Some profiles are temporarily unavailable.' : ''}`;
  return `<aside class="dj-catalog-note" aria-label="DJ catalog coverage"><p><strong>Behind the decks.</strong> ${escape(status)}</p><p>Rankings are annual DJ Mag poll editions. An unlinked artist may be absent from the current catalog.</p><a href="${CATALOG_URL}" target="_blank" rel="noopener noreferrer">Explore the DJ catalog ↗</a></aside>`;
}
