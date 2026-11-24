# Vegas Parties

A source-backed snapshot of the [original weekly party menu](https://halfsaintvegas.com/pages/this-weeks-party-menu), with a GitHub Pages menu website and a separate existing Cloudflare API. The source can contain past dates or change structure; the service reports what was observed rather than asserting that it is current. It is not affiliated with the original publisher or venues.

## Existing API service (unchanged)

- `GET /api/menu` — structured menu and freshness metadata.
- `GET /rss.xml` — RSS feed.
- `GET /openapi.json` — OpenAPI description; the source is `docs/api/openapi.json`.

See the OpenAPI document for response fields and examples. The original wording and conditions are retained in the snapshot; check the source before making plans.

## Sync and operations

`npm ci`, `npm test`, `npm run sync`, and `npm run build` run the tests, fetch and validate the menu, and build the Pages advanced-mode Worker. Node.js 22 or newer is required. A failed fetch or validation exits unsuccessfully without replacing `data/menu.json`. The GitHub Actions workflow runs every Monday at 18:17 UTC and can be run manually. It commits only a validated snapshot; failures are visible in Actions and the run summary. GitHub may delay scheduled runs.

The deployed Worker reads the latest committed snapshot from this public repository. If it cannot retrieve or validate it, it falls back to the snapshot bundled at deployment and exposes that condition. That fallback may be older than the latest successful sync. The current source's week-ending date, when explicitly linked from the source, is used for freshness; absence of that evidence is reported as unknown. Fetch time is not proof that the menu itself has been updated.

To change Worker code, run `npm run build` and deploy the resulting `dist` directory to the Cloudflare Pages project `half-saints-party-menu`. The weekly data update does not require a Cloudflare API token.

## GitHub Pages menu website

The public page is branded **Vegas Parties**, including its title, sharing metadata, header and footer. Source names are not displayed as site branding; original source links and collected data remain unchanged.

`npm run build:site` generates `site-dist/`: a responsive, source-backed menu, local JSON snapshot and RSS. The website contains no charts or chart-library dependencies and requires no Cloudflare resources, secrets or external CDN. The existing API/RSS service code and source collector are preserved.

Party-type and weekday buttons, search, reset and shareable URL filters make the original listings easy to browse. Each card retains the original artist, venue, date wording and entry conditions. The fine print links to the original menu. Recurring entries are explicitly marked without assigning invented dates. The browser recalculates freshness using the current Las Vegas date. With JavaScript disabled, all published menu cards remain readable.

`Deploy menu website` publishes after a relevant main-branch push or successful `Weekly menu sync`, and supports manual deployment without another crawl. The existing Monday 18:17 UTC cron is unchanged; there is no additional schedule. The workflow_run trigger handles successful snapshot commits made by GITHUB_TOKEN. Failed collection retains the last successful snapshot and published menu.

GitHub Pages uses Actions at https://yuxiaoli.github.io/vegas-party-menu/ . The build uses relative asset/data/feed paths. Verify with `npm ci && npm test && npm run build:site` and desktop/mobile browser checks.

## DJ catalog integration

The static website enriches exact artist matches using the existing [DJ catalog](https://yuxiaoli.github.io/djmag-data/). Every Pages build reads its public index, then only the matching artists' JSON and detail pages. No additional crawler, schedule, chart or API change is introduced. `site-dist/data/dj-matches.json` records the catalog edition, read time, coverage and verified profile fields.

Matching is case/spacing-insensitive and removes only a trailing explicit arrival-time note such as `(9pm arrival!)`. It does not fuzzy-match, strip DJ prefixes, guess aliases, split collaborations or identify generic party descriptions. Ambiguous names remain unmatched. Unmatched does not mean unranked. Ranking years come from the catalog's annual edition and are checked against the artist record, not inferred from collection time. Cards show only ranking, From and Best known for when supported by field-level provenance; unknowns are omitted. Only accurate matches link the artist name in the outer heading; any explicit arrival-time suffix stays as plain, unlinked text in the same heading and is not repeated in the entry details. The purple box contains ranking, From with a bold value, left-aligned best-known-for text and an explicit “View DJ profile ↗” link below the profile facts using the original arrow character, consistent with the other page links, without repeating the artist name. Meaningful fragments are emphasized only for an exact reviewed source sentence; changed or unreviewed text stays plain. Unmatched titles remain unchanged. Generated summaries, style fields and record timestamps are not shown on menu cards. Origin is labelled "From", not treated as nationality.

The menu remains complete if the optional catalog is unavailable; unmatched entries remain unchanged. A failed or mismatched artist record is omitted rather than showing stale or invented details. Existing source JSON, API/RSS and Monday 18:17 UTC collection remain unchanged.

Artist headings and profile buttons pass the page language to the DJ catalog using its published `lang` parameter. Ranking links go to the original DJ Mag source. The venue catalog currently publishes English detail pages.

Repository and GitHub Pages name: `vegas-party-menu`. Previous GitHub repository URLs redirect, but GitHub does not guarantee redirects for the former Pages site path. Legacy Cloudflare API/RSS URLs and collector configuration are unchanged.

The root home URL defaults to This week. All dates shows every retained current/future-week event, matched or unmatched. Shared URLs with `q`, `day` or `type` parameters intentionally apply the existing search filters; use the root site URL when sharing the complete menu.

### Website languages

The English menu starts at `/vegas-party-menu/`. The language switch opens Simplified Chinese at `/vegas-party-menu/zh-CN/` and remembers the choice in this browser. The switch preserves search, filters, and the current section. Share the Chinese URL to open Chinese directly, or use `?lang=en` on the root URL to explicitly share English. Reset clears the filters and keeps the current language.

The build renders a static page for each locale from `src/messages.js`, sharing one browser script, the same source snapshots, and the same filter values. To add a language, register its code, native display name, and message catalog in that module. Missing messages fall back to English. Dates and times display in `America/Los_Angeles` and use the selected locale's formatting. Original artist names, venues, entry conditions, and source links remain on both pages. Search matches original event text and English/Chinese party-type and weekday labels in either language.

The Chinese cards translate entry conditions during rendering. The rules in `src/entry-translation.js` cover the published menu's wording and common price, time, age, dress and guest list conditions. Readers can expand the original English beneath a translation. When new wording falls outside the verified rules, the card shows that clause in English with a Chinese notice. The source snapshot and entry search text retain the original wording.

## Venue detail links

The existing venue name becomes a link only after a reviewed full-label alias matches the [published venue catalog](https://yuxiaoli.github.io/djmag-data/venues/index.html). The 11 aliases in `src/venue-catalog.js` record the expected catalog ID, canonical name, dayclub/nightclub type, hotel and original source URL. Every Pages build verifies the index, selected JSON records, source provenance and detail-page heading before emitting a link. `site-dist/data/venue-matches.json` records verification time and coverage.

Dayclub/nightclub identities are kept separate, including Marquee. Drais Afterhours, La Jolla and Sapphire are currently unmatched and remain plain text. There is no fuzzy matching, hotel stripping or invented identity. A catalog outage or mismatched record simply omits optional links while retaining every menu card, its original wording and all DJ panels. Venue directory hours, policies and factual summaries never overwrite event-specific menu conditions. Reads use the published catalog only, with bounded concurrency and retries; there is no extra crawler or schedule. Existing source JSON, API/RSS and Monday 18:17 UTC collection remain unchanged.

### Dress-code guide and credit

The existing “The rest of the menu” area includes a concise, attributed summary of the [Half Saint dress-code guide](https://halfsaintvegas.com/pages/vegas-dress-code), checked November 15, 2026. It distinguishes dayclub/nightclub guidance, links the complete source, and notes that venue requirements and admission decisions may differ. This is presentation-only, not added source-event data or a new crawler/schedule. The exact personal credit appears within the light footer with a thin divider and left-aligned muted text; only Sean is linked.

### All collected weeks and global search

The website also publishes `data/calendar.json`: the current menu plus every week actually linked by the current menu and Upcoming Events index. The existing Monday 18:17 UTC sync collects the same sources; no new schedule or service is created. API/RSS and `data/menu.json` retain their current-week contract. Calendar snapshots preserve source URL, capture time, original wording, advertised week and date provenance. A failed fetch/validation keeps the previous calendar rather than publishing a partial one.

Date controls are ordered This week (the default), Next week, Upcoming, All dates. All dates shows every retained listing. The controls and compact date selector use **America/Los_Angeles**, with Monday–Sunday weeks and explicit event dates only. Undated recurring entries are not expanded into invented occurrences and remain in All dates with their source-week label. Starting a search clears date/day/type restrictions, searching all collected dates; filters can then refine the results. Reset returns the root page with This week selected. Explicit All dates selections round-trip in the URL. Global search never includes retired past weeks.

Future listings are provisional according to the source. Exact duplicates merge provenance; conflicting terms remain distinct. Source week labels do not truncate explicit dates: the NYE page says week ending 2027-01-02 but lists Sunday 2027-01-03, which is retained with a warning. Event years are resolved from verified source week labels, never from collection timestamps.

Successful, complete refreshes retire earlier-week events from the calendar snapshot using Las Vegas Monday midnight, keeping the whole current week and future weeks. Explicit event dates take precedence over source-week labels; undated recurring entries use their verified source week. Invalid, stale-current, partial or failed collections cannot replace either stored snapshot. The original current-menu API/RSS contract remains unchanged. At build time and in the browser, earlier-week cards are excluded even if the last successful snapshot is older; an open tab updates its cards and date choices across local Monday midnight. Git history is not rewritten.
