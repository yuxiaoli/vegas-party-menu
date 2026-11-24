import { CATALOG_URL, catalogDetailUrl } from './djmag-links.js';
import { createTranslator, DEFAULT_LOCALE } from './messages.js';

export const VENUE_INDEX_URL = new URL('data/venues/index.json', CATALOG_URL).href;
export const venueKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const defaultT = createTranslator();

// Reviewed 2026-11-15 against each published source record's name, category and hotel.
// Match the entire menu label: never strip @hotel, dayclub, brunch, rooftop or afterhours.
export const VENUE_ALIASES = [
  ['LAVO BRUNCH @PALAZZO', 'lavo-brunch', 'Lavo Party Brunch', 'dayclub', 'Palazzo Hotel'],
  ['MARQUEE DAYCLUB @COSMOPOLITAN', 'marquee-dayclub', 'Marquee Dayclub', 'dayclub', 'Cosmopolitan Hotel'],
  ['JEWEL @ARIA', 'jewel-nightclub', 'Jewel Nightclub', 'nightclub', 'Aria Hotel'],
  ['TAO @VENETIAN', 'tao-nightclub', 'TAO Nightclub', 'nightclub', 'Venetian Hotel'],
  ['GHOSTBAR ROOFTOP @PALMS', 'ghost-bar', 'Ghostbar Las Vegas', 'nightclub', 'Palms Hotel'],
  ['ZOUK @RESORTSWORLD', 'zouk-nightclub', 'Zouk Nightclub', 'nightclub', 'Resorts World Hotel'],
  ['XS @ENCORE', 'xs-nightclub', 'XS Nightclub', 'nightclub', 'Encore Hotel'],
  ['LIV @FONTAINEBLEAU', 'liv-nightclub', 'LIV Nightclub Las Vegas', 'nightclub', 'Fontainebleau Hotel'],
  ['MARQUEE @COSMOPOLITAN', 'marquee-nightclub', 'Marquee Nightclub', 'nightclub', 'Cosmopolitan Hotel'],
  ['HAKKASAN @MGM', 'hakkasan-nightclub', 'Hakkasan Nightclub', 'nightclub', 'MGM Grand Hotel'],
  ['OMNIA @CAESARSPALACE', 'omnia-nightclub', 'Omnia Nightclub', 'nightclub', 'Caesars Palace Hotel'],
].map(([menuVenue, id, name, type, location]) => ({menuVenue, id, name, type, location,
  sourceUrl: `https://nocovernightclubs.com/${type === 'dayclub' ? 'pool-parties' : 'nightclubs'}/${id}${id === 'ghost-bar' ? '' : '/'}`
}));

export function reviewedVenue(value) {
  const matches = VENUE_ALIASES.filter(alias => venueKey(alias.menuVenue) === venueKey(value));
  return matches.length === 1 ? matches[0] : null;
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function renderVenueName(value, catalog, { t = defaultT, locale = DEFAULT_LOCALE } = {}) {
  const label = escape(value || t('card.venueUnknown'));
  const alias = reviewedVenue(value);
  if (!alias) return label;
  const matches = (catalog?.venues || []).filter(venue => venue.id === alias.id && venueKey(venue.name) === venueKey(alias.name) && venue.type === alias.type && venueKey(venue.location) === venueKey(alias.location));
  const canonicalUrl = catalogDetailUrl('venues', alias.id);
  if (matches.length !== 1 || matches[0].detailUrl !== canonicalUrl) return label;
  const href = catalogDetailUrl('venues', alias.id, locale);
  if (locale === 'zh-CN' && matches[0].detailUrls?.[locale] !== href) return label;
  const detailsLabel = t('card.venueDetails', { venue: value });
  return `<a class="venue-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(detailsLabel)}">${label}</a>`;
}
