import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {CATALOG_URL} from '../src/dj-catalog.js';
import {VENUE_ALIASES, VENUE_INDEX_URL, reviewedVenue, renderVenueName} from '../src/venue-catalog.js';
import {parseVenueIndex, verifyVenue, loadVenueCatalog} from '../scripts/venue-catalog.mjs';
import {renderSite} from '../src/site.js';
// Fixed historical fixture: exact DJ/venue regression expectations must not drift with weekly sync.
import menu from './fixtures/menu-2026-11-15.json' with {type:'json'};

import currentMenu from '../data/menu.json' with {type:'json'};

const index = {venues: VENUE_ALIASES.map(a => ({id:a.id,name:a.name,type:a.type,detail_url:`venues/${a.id}.html`,json_url:`data/venues/${a.id}.json`}))};
const profile = a => ({id:a.id,name:a.name,listing_category:a.type,facts:{location:a.location},source:{url:a.sourceUrl,observed_at:'2026-11-15T00:00:00Z'},field_provenance:{location:{source_url:a.sourceUrl,retrieved_at:'2026-11-15T00:00:00Z'}}});
const fixtureFetch = async url => {
 if(url===VENUE_INDEX_URL)return new Response(JSON.stringify(index));
 const a=VENUE_ALIASES.find(a => url===CATALOG_URL+`data/venues/${a.id}.json` || url===CATALOG_URL+`venues/${a.id}.html`);
 assert.ok(a,'Never fetch unreviewed venues or external source');
 return new Response(url.endsWith('.json')?JSON.stringify(profile(a)):`<h1>${a.name}</h1>`);
};

test('venue aliases require complete reviewed label, preserving hotel and day/night identity',()=>{
 assert.equal(VENUE_ALIASES.length,11);
 assert.equal(reviewedVenue('  marquee   dayclub @cosmopolitan ').id,'marquee-dayclub');
 assert.equal(reviewedVenue('MARQUEE @COSMOPOLITAN').id,'marquee-nightclub');
 for(const name of ['MARQUEE','MARQUEE @PALAZZO','MARQUEE NIGHTCLUB @COSMOPOLITAN','LIV BEACH @FONTAINEBLEAU','OMNIA DAYCLUB @CAESARSPALACE','DRAIS AFTERHOURS @CROMWELL','LA JOLLA NIGHTCLUB','SAPPHIRE STRIP CLUB'])assert.equal(reviewedVenue(name),null,name);
});

test('venue index rejects duplicate IDs, external URLs, traversal and bad categories',()=>{
 assert.equal(parseVenueIndex(index).length,11);
 for(const override of [{detail_url:'https://other.invalid/venue'},{json_url:'data/venues/../wrong.json'},{type:'afterparty'},{id:'../x'}]) assert.throws(()=>parseVenueIndex({venues:[{...index.venues[0],...override}]}));
 assert.throws(()=>parseVenueIndex({venues:[index.venues[0],index.venues[0]]}));
 assert.throws(()=>parseVenueIndex({venues:[]}));
});

test('venue identity, hotel, type, provenance and live page heading must all agree',()=>{
 const a=VENUE_ALIASES[0], e=index.venues[0], p=profile(a), html=`<h1>${a.name}</h1>`;
 assert.equal(verifyVenue(p,e,a,html).detailUrl,CATALOG_URL+e.detail_url);
 for(const override of [{id:'wrong'},{name:'Other venue'},{listing_category:'nightclub'},{facts:{location:'Other hotel'}},{source:{...p.source,url:'https://other.invalid/'}},{field_provenance:{}},{source:{...p.source,observed_at:null}}]) assert.throws(()=>verifyVenue({...p,...override},e,a,html));
 assert.throws(()=>verifyVenue(p,e,a,'<h1>Another venue</h1>'));
 assert.throws(()=>verifyVenue(p,{...e,type:'nightclub'},a,html));
});

test('loader reads only selected published records, deduplicates and preserves menu',async()=>{
 const urls=[],before=JSON.stringify(menu);
 const catalog=await loadVenueCatalog(menu,{fetchImpl:async url=>{urls.push(url);return fixtureFetch(url);}});
 assert.equal(catalog.status,'ok');assert.equal(catalog.venues.length,11);assert.equal(catalog.matchedListingCount,35);
 assert.equal(urls.length,23);assert.ok(urls.every(url=>url.startsWith(CATALOG_URL)));
 assert.equal(JSON.stringify(menu),before);
});

test('Chinese venue links require the published alternate and keep the same venue identity', async () => {
 const alias = VENUE_ALIASES.find(a => a.id === 'omnia-nightclub');
 const canonical = CATALOG_URL + `venues/${alias.id}.html`;
 const localized = CATALOG_URL + `venues/zh-CN/${alias.id}.html`;
 const event = { ...menu.events[0], venue: alias.menuVenue };
 const fixture = { ...menu, events: [event] };
 const urls = [];
 const catalog = await loadVenueCatalog(fixture, {
  fetchImpl: async url => {
   urls.push(url);
   if (url === canonical) return new Response(`<h1>${alias.name}</h1><a href="zh-CN/${alias.id}.html" hreflang="zh-CN">简体中文</a>`);
   if (url === localized) return new Response(`<html lang="zh-CN"><h1>${alias.name}</h1></html>`);
   return fixtureFetch(url);
  }
 });
 assert.equal(catalog.venues[0].detailUrl, canonical);
 assert.deepEqual(catalog.venues[0].detailUrls, { 'zh-CN': localized });
 assert.equal(urls.filter(url => url === localized).length, 1);
 for (const [locale, href] of [['en', canonical], ['zh-CN', localized]]) {
  const $ = load(renderSite(fixture, { source: 'github' }, new Date(), null, catalog, null, { locale }));
  assert.equal($('.venue-link').attr('href'), href);
  assert.equal($('.venue-link').text(), alias.menuVenue);
 }
 const invalid = { venues: [{ ...catalog.venues[0], detailUrls: { 'zh-CN': CATALOG_URL + 'venues/zh-CN/xs-nightclub.html' } }] };
 assert.equal(renderVenueName(alias.menuVenue, invalid, { locale: 'zh-CN' }), alias.menuVenue);
});

test('unavailable or mismatched Chinese pages keep the label plain and the English link active', async () => {
 const alias = VENUE_ALIASES[0];
 const canonical = CATALOG_URL + `venues/${alias.id}.html`;
 const localized = CATALOG_URL + `venues/zh-CN/${alias.id}.html`;
 const relative = `zh-CN/${alias.id}.html`;
 const variants = [
  { href: 'https://other.invalid/venue' },
  { href: 'zh-CN/other-venue.html' },
  { href: relative, status: 404 },
  { href: relative, html: `<html lang="en"><h1>${alias.name}</h1></html>` },
  { href: relative, html: '<html lang="zh-CN"><h1>Other venue</h1></html>' }
 ];
 for (const { href, html, status } of variants) {
  let localizedRequests = 0;
  const catalog = await loadVenueCatalog({ events: [{ venue: alias.menuVenue }] }, {
   fetchImpl: async url => {
    if (url === canonical) return new Response(`<h1>${alias.name}</h1><a href="${href}" hreflang="zh-CN">简体中文</a>`);
    if (url === localized) {
     localizedRequests++;
     return new Response(html, { status });
    }
    return fixtureFetch(url);
   }
  });
  assert.equal(catalog.status, 'ok');
  assert.equal(localizedRequests, Number(href === relative));
  assert.equal(renderVenueName(alias.menuVenue, catalog, { locale: 'zh-CN' }), alias.menuVenue);
  assert.equal(load(renderVenueName(alias.menuVenue, catalog))('a').attr('href'), canonical);
 }
});

test('optional venue failure keeps every original card, DJ content and unknown labels quiet',async()=>{
 const a=VENUE_ALIASES[0];
 const partial=await loadVenueCatalog(menu,{fetchImpl:async url=>url===CATALOG_URL+`data/venues/${a.id}.json`?new Response('{}'):fixtureFetch(url)});
 assert.equal(partial.status,'partial');assert.equal(partial.venues.length,10);assert.equal(partial.failedVenues,1);
 const unavailable=await loadVenueCatalog(menu,{fetchImpl:async()=>new Response('Missing',{status:404})});
 assert.equal(unavailable.status,'unavailable');assert.deepEqual(unavailable.venues,[]);
 for(const catalog of [partial,unavailable]) {
  const $=load(renderSite(menu,{source:'github'},new Date(),null,catalog));
  assert.equal($('.event-card').length,41);assert.equal($('.event-card h3 a').length,0);
  $('.event-card').each((i,el)=>{assert.equal($(el).find('h3').text(),menu.events[i].description);assert.equal($(el).find('.venue').text(),menu.events[i].venue);});
  assert.equal($('.venue').filter((_,el)=>$(el).text().includes('DRAIS')).find('a').length,0);
  assert.ok(!$.text().includes('No venue match'));
 }
});

test('verified venue links preserve visible labels and cannot link unreviewed or unsafe profiles',async()=>{
 const catalog=await loadVenueCatalog(menu,{fetchImpl:fixtureFetch});
 const dj={profiles:[{id:'alesso',name:'Alesso',detailUrl:CATALOG_URL+'djs/alesso.html',sourceUrl:'https://djmag.com/top100djs/2026/56/alesso',year:2026,rank:56,origin:'Sweden',bestKnownFor:'Verified work'}]};
 const $=load(renderSite(menu,{source:'github'},new Date(),dj,catalog));
 assert.equal($('.venue-link').length,35);assert.equal($('.dj-profile').length,1);
 assert.equal($('.dj-details').attr('href'),CATALOG_URL+'djs/alesso.html?lang=en');
 $('.event-card').each((i,el)=>{const a=reviewedVenue(menu.events[i].venue);const link=$(el).find('.venue a');assert.equal(link.length,a?1:0);if(a){assert.equal(link.attr('href'),CATALOG_URL+`venues/${a.id}.html`);assert.equal(link.text(),menu.events[i].venue);assert.equal(link.attr('rel'),'noopener noreferrer');}});
 const value=VENUE_ALIASES[0].menuVenue, p=catalog.venues[0];
 assert.equal(renderVenueName(value,{venues:[{...p,detailUrl:'javascript:alert(1)'}]}),value);
 assert.equal(renderVenueName(value,{venues:[p,p]}),value);
 assert.ok(!renderVenueName('<img src=x onerror=alert(1)>',catalog).includes('<img'));
});

test('transient venue reads retry once, authorization errors never retry',async()=>{
 let calls=0;
 const good=await loadVenueCatalog({events:[]},{fetchImpl:async()=>new Response(++calls===1?'Temporary':JSON.stringify(index),{status:calls===1?503:200})});
 assert.equal(calls,2);assert.equal(good.status,'ok');
 calls=0;const denied=await loadVenueCatalog(menu,{fetchImpl:async()=>{calls++;return new Response('Forbidden',{status:403});}});
 assert.equal(calls,1);assert.equal(denied.status,'unavailable');
});

// Keep the published snapshot covered too, without imposing a prior week's counts.
test('current weekly snapshot preserves every event and only links verified exact matches', async () => {
 const before=JSON.stringify(currentMenu);
 const expected=currentMenu.events.filter(event=>reviewedVenue(event.venue));
 const ids=new Set(expected.map(event=>reviewedVenue(event.venue).id));
 const urls=[];
 const catalog=await loadVenueCatalog(currentMenu,{fetchImpl:async url=>{urls.push(url);return fixtureFetch(url);}});
 assert.equal(catalog.status,'ok');assert.equal(catalog.venues.length,ids.size);
 assert.equal(catalog.matchedListingCount,expected.length);assert.equal(urls.length,1+2*ids.size);
 const $=load(renderSite(currentMenu,{source:'github'},new Date(),null,catalog));
 assert.equal($('.event-card').length,currentMenu.events.length);
 assert.equal($('.venue-link').length,expected.length);
 $('.event-card').each((i,el)=>{
  const event=currentMenu.events[i],alias=reviewedVenue(event.venue),link=$(el).find('.venue a');
  assert.equal($(el).find('h3').text(),event.description);
  assert.equal($(el).find('.venue').text(),event.venue);
  assert.equal($(el).find('.entry p').text(),event.details);
  assert.equal(link.length,alias?1:0);
  if(alias)assert.equal(link.attr('href'),CATALOG_URL+`venues/${alias.id}.html`);
 });
 assert.equal(JSON.stringify(currentMenu),before);
});
