import { CATALOG_URL } from './dj-catalog.js';

export const VENUE_INDEX_URL = new URL('data/venues/index.json', CATALOG_URL).href;
export const venueKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

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
export function renderVenueName(value, catalog) {
  const label = escape(value || 'Venue not specified');
  const alias = reviewedVenue(value);
  if (!alias) return label;
  const matches = (catalog?.venues || []).filter(venue => venue.id === alias.id && venueKey(venue.name) === venueKey(alias.name) && venue.type === alias.type && venueKey(venue.location) === venueKey(alias.location));
  const expectedUrl = new URL(`venues/${alias.id}.html`, CATALOG_URL).href;
  if (matches.length !== 1 || matches[0].detailUrl !== expectedUrl) return label;
  return `<a class="venue-link" href="${expectedUrl}" target="_blank" rel="noopener noreferrer" aria-label="${label}: venue details (opens in new tab)">${label}</a>`;
}
