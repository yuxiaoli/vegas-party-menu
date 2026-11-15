import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {CATALOG_URL} from '../src/dj-catalog.js';
import {VENUE_ALIASES, VENUE_INDEX_URL, reviewedVenue, renderVenueName} from '../src/venue-catalog.js';
import {parseVenueIndex, verifyVenue, loadVenueCatalog} from '../scripts/venue-catalog.mjs';
import {renderSite} from '../src/site.js';
import menu from '../data/menu.json' with {type:'json'};

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
 assert.equal($('.dj-details').attr('href'),CATALOG_URL+'djs/alesso.html');
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
