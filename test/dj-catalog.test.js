import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {artistKey, matchArtist, renderDJProfile, renderArtistHeading, renderKnownFor, CATALOG_URL} from '../src/dj-catalog.js';
import {parseCatalogIndex, verifyProfile, loadDJCatalog} from '../scripts/dj-catalog.mjs';
import {renderSite} from '../src/site.js';
// Fixed historical fixture: exact DJ/venue regression expectations must not drift with weekly sync.
import menu from './fixtures/menu-2026-11-15.json' with {type:'json'};
import currentMenu from '../data/menu.json' with {type:'json'};
const entry={id:'steve-aoki',name:'Steve Aoki',rank:18,year:2026,detailUrl:CATALOG_URL+'djs/steve-aoki.html'};
const source='https://djmag.com/top100djs/2026/18/steve-aoki';
const profile={schema_version:'1.0.0',id:entry.id,name:entry.name,updated_at:'2026-11-15T00:00:00Z',rankings:[{year:2026,rank:18,source_url:source}],sources:[{url:source,retrieved_at:'2026-11-15T00:00:00Z',fields:['/rankings','/name']}],styles:[],origin:null,description:null};
const detail='<h1>Steve Aoki</h1>';
const index=Array.from({length:100},(_,i)=>`<a class="card" href="djs/${i===17?'steve-aoki':'artist-'+i}.html"><span class="rank">${i+1}</span><h2>${i===17?'Steve Aoki':'Artist '+i}</h2><small>DJ Mag 2026</small></a>`).join('');
test('artist matching is exact after case/spacing and explicit arrival-note cleanup only',()=>{
 assert.equal(artistKey('  Steve   Aoki (9pm arrival!) '),'steve aoki');
 assert.equal(matchArtist('STEVE AOKI',[entry]),entry);
 for(const input of ['Steve Aoki tribute','Steve Aoki (tribute)','Steve Aoki & Alesso','DJ Steve Aoki','Aoki','HipHop/Top40','Special Guest','Kaskade'])assert.equal(matchArtist(input,[entry]),null);
 assert.equal(matchArtist('Steve Aoki',[entry,{...entry,id:'other'}]),null);
});
test('index rejects partial, duplicate and external-link catalogs',()=>{
 assert.equal(parseCatalogIndex(index).length,100);
 assert.throws(()=>parseCatalogIndex(index.slice(index.indexOf('</a>')+4)));
 assert.throws(()=>parseCatalogIndex(index.replace('djs/artist-0.html','https://untrusted.example/a')));
 assert.throws(()=>parseCatalogIndex(index.replace('djs/artist-0.html','djs/steve-aoki.html')));
});
test('rank comes from latest verified edition, not array position or collection year',()=>{
 const good=verifyProfile({...profile,rankings:[...profile.rankings,{year:2025,rank:4,source_url:'https://djmag.com/top100djs/2025/4/steve-aoki'}]},entry,detail);
 assert.equal(good.year,2026);assert.equal(good.rank,18);assert.equal(good.observedAt,profile.updated_at);
 assert.throws(()=>verifyProfile({...profile,rankings:[{...profile.rankings[0],year:2025}]},entry,detail));
 assert.throws(()=>verifyProfile({...profile,rankings:[{...profile.rankings[0],source_url:'https://djmag.com/top100djs/2025/18/steve-aoki'}]},entry,detail));
});
test('identity, detail page and field provenance must agree',()=>{
 assert.throws(()=>verifyProfile({...profile,id:'wrong'},entry,detail));
 assert.throws(()=>verifyProfile(profile,entry,'<h1>Another artist</h1>'));
 assert.throws(()=>verifyProfile({...profile,sources:[]},entry,detail));
 const unproven=verifyProfile({...profile,description:'Not sourced',origin:'Not sourced',styles:['Unverified']},entry,detail);
 assert.equal(unproven.description,null);assert.equal(unproven.origin,null);assert.deepEqual(unproven.styles,[]);
 const proven=verifyProfile({...profile,origin:'Example origin',sources:[{...profile.sources[0],fields:['/rankings','/origin']}]},entry,detail);
 assert.equal(proven.origin,'Example origin');
});
test('only matching artist endpoints are fetched and repeat listings are deduplicated',async()=>{
 const urls=[]; const result=await loadDJCatalog({events:[{description:'Steve Aoki'},{description:'Steve Aoki (9pm arrival!)'},{description:'Special Guest'}]},{fetchImpl:async url=>{urls.push(url);return new Response(url===CATALOG_URL?index:url.endsWith('.json')?JSON.stringify(profile):detail);}});
 assert.equal(result.status,'ok');assert.equal(result.matchedListingCount,2);assert.equal(result.profiles.length,1);assert.equal(urls.length,3);
 assert.ok(urls.every(url=>url.startsWith(CATALOG_URL)));
});
test('catalog outage and bad artist records degrade without inventing enrichment',async()=>{
 const missing=await loadDJCatalog(menu,{fetchImpl:async()=>new Response('Unavailable',{status:503})});
 assert.equal(missing.status,'unavailable');assert.deepEqual(missing.profiles,[]);
 const partial=await loadDJCatalog({events:[{description:'Steve Aoki'}]},{fetchImpl:async url=>new Response(url===CATALOG_URL?index:url.endsWith('.json')?'{}':detail)});
 assert.equal(partial.status,'partial');assert.equal(partial.failedProfiles,1);assert.equal(partial.matchedListingCount,0);
});
test('rendering preserves source menu and omits missing biography fields and labels annual edition',()=>{
 const dj=verifyProfile(profile,entry,detail);const catalog={status:'ok',year:2026,matchedListingCount:1,profiles:[dj]};
 const html=renderSite(menu,{source:'github'},new Date('2026-11-15T12:00:00Z'),catalog);
 assert.equal((html.match(/<article class="event-card"/g)||[]).length,41);assert.equal((html.match(/class="dj-profile"/g)||[]).length,1);
 assert.match(html,/DJ MAG 2026/);assert.match(html,/#18/);assert.ok(!html.includes('<dt>From</dt>'));assert.ok(!html.includes('<dt>Best known for</dt>'));assert.ok(!html.includes('>null<'));assert.ok(!html.includes('Catalog record updated'));assert.ok(html.includes('View DJ profile '));assert.ok(!html.includes('No DJ'));
 assert.equal(load(html)('.artist-link').text(),'Steve Aoki');assert.equal(load(html)('.arrival-note').length,0);assert.equal(load(html)('.artist-link').parent().text(),'Steve Aoki (9pm arrival!)');assert.ok(html.includes(entry.detailUrl));assert.ok(!html.includes('<canvas'));
 const bad={...dj,description:'<img src=x onerror=alert(1)>'};assert.ok(!renderDJProfile('Steve Aoki',{profiles:[bad]}).includes('<img'));
});

test('transient catalog reads retry once; authorization errors never retry',async()=>{
 let calls=0;
 const recovered=await loadDJCatalog({events:[]},{fetchImpl:async()=>new Response(++calls===1?'Temporary':index,{status:calls===1?503:200})});
 assert.equal(calls,2);assert.equal(recovered.status,'ok');
 calls=0;const denied=await loadDJCatalog({events:[]},{fetchImpl:async()=>{calls++;return new Response('Forbidden',{status:403});}});
 assert.equal(calls,1);assert.equal(denied.status,'unavailable');
});

test("footer uses Sean's saved credit and the renamed repository link",()=>{
 const html=renderSite(menu,{source:'github'});
 assert.match(html,/Built by <a href="https:\/\/www\.linkedin\.com\/in\/yuxiaoli\/"[^>]*>Sean<\/a> with ❤️/);
 assert.ok(html.includes('https://github.com/yuxiaoli/vegas-party-menu'));
});

test('matched heading links artist only; purple panel has rank, bold origin, known-for and explicit details link',()=>{
 const dj={...verifyProfile(profile,entry,detail),origin:'Example place',bestKnownFor:'Verified work',styles:['Do not render style'],description:'Do not render generated summary'};
 const catalog={status:'ok',year:2026,matchedListingCount:1,profiles:[dj]};
 const html=renderSite(menu,{source:'github'},new Date('2026-11-15T12:00:00Z'),catalog);
 const $=load(html), cards=$('.event-card');
 assert.equal(cards.length,menu.events.length);assert.equal(cards.find('h3 a').length,1);
 cards.each((i,card)=>assert.equal($(card).find('h3').text(),menu.events[i].description));
 const panel=cards.filter((_,e)=>$(e).find('h3').text().startsWith('Steve Aoki')).find('.dj-profile');
 assert.deepEqual(panel.children().map((_,e)=>$(e).attr('class')).get(),['dj-rank','dj-from','dj-known','dj-details']);
 assert.equal(panel.find('.dj-name').length,0);assert.equal(panel.find('.dj-details').attr('href'),entry.detailUrl);assert.equal(panel.find('.dj-details').text().trim(),'View DJ profile ↗');
 assert.equal(cards.find('h3 a').attr('href'),entry.detailUrl);assert.equal(cards.find('h3 a').text(),'Steve Aoki');assert.equal(cards.find('.arrival-note').length,0);assert.equal(cards.find('h3 a').parent().text(),'Steve Aoki (9pm arrival!)');
 cards.each((i,card)=>assert.equal($(card).find('.entry p').text(),menu.events[i].details));
 assert.equal(panel.find('.dj-from').text(),'From Example place');assert.equal(panel.find('.dj-from strong').text(),'Example place');assert.equal(panel.find('.dj-known').text(),'Verified work');
 assert.ok(!panel.text().includes('Best known for'));assert.ok(!panel.text().includes('Do not render'));assert.ok(!panel.text().includes('Catalog record updated'));assert.ok(panel.text().includes('View DJ profile '));
 for(const description of ['R&B Party','HipHop/Top40','Kaskade']) assert.equal(renderDJProfile(description,catalog),'');
 assert.ok(!renderDJProfile('Steve Aoki',{profiles:[{...dj,origin:'<script>bad</script>'}]}).includes('<script>'));
});


test('only reviewed meaningful fragments are emphasized, preserving exact source text',()=>{
 const text='Working with artists like Calvin Harris, Swedish House Mafia, Usher, and David Guetta.';
 const $=load('<p>'+renderKnownFor({id:'alesso',bestKnownFor:text})+'</p>');
 assert.equal($('p').text(),text);assert.deepEqual($('strong').map((_,e)=>$(e).text()).get(),['Calvin Harris','Swedish House Mafia','Usher','David Guetta']);
 assert.ok($('strong').text().length<text.length);
 for(const dj of [{id:'other',bestKnownFor:text},{id:'alesso',bestKnownFor:text+' Updated.'},{id:'alesso',bestKnownFor:'<script>bad</script>'}]){const html=renderKnownFor(dj);assert.ok(!html.includes('<strong>'));assert.ok(!html.includes('<script>'));}
});

test('arrival suffix stays plain in the heading; unmatched and ambiguous titles stay untouched',()=>{
 const catalog={profiles:[verifyProfile(profile,entry,detail)]};
 for(const title of ['Steve Aoki (9pm arrival!)','Steve Aoki (10:30pm arrival!)','Steve Aoki (930pm arrival!)','Steve Aoki (1230am arrival!)','Steve Aoki']) {
  const $=load('<h3>'+renderArtistHeading(title,catalog)+'</h3>');
  assert.equal($('h3').text(),title);assert.equal($('h3 a').text(),'Steve Aoki');assert.equal($('h3 a').attr('href'),entry.detailUrl);
  assert.ok(!$('h3 a').text().includes('arrival'));
  if(title.includes('arrival'))assert.equal($('h3').contents().last()[0].type,'text');
 }
 for(const title of ['Kaskade (9pm arrival!)','R&B Party','Steve Aoki (tribute)','Steve Aoki & Alesso']){const $=load('<h3>'+renderArtistHeading(title,catalog)+'</h3>');assert.equal($('h3').text(),title);assert.equal($('a').length,0);}
 const ambiguous={profiles:[catalog.profiles[0],{...catalog.profiles[0],id:'other'}]};
 assert.equal(renderArtistHeading('Steve Aoki (9pm arrival!)',ambiguous),'Steve Aoki (9pm arrival!)');
});

test('profile link ends the panel with the original arrow character and no SVG',()=>{
 const dj={...verifyProfile(profile,entry,detail),origin:'Sweden',bestKnownFor:'Verified work'};
 const $=load(renderDJProfile('Steve Aoki',{profiles:[dj]}));
 const link=$('.dj-details');
 assert.equal($('.dj-profile').children().last().attr('class'),'dj-details');
 assert.equal(link.text().trim(),'View DJ profile ↗');assert.equal(link.attr('href'),entry.detailUrl);
 assert.equal(link.find('svg').length,0);assert.equal(link.attr('rel'),'noopener noreferrer');
});

test('current weekly DJ headings retain the exact refreshed arrival text', () => {
 const dj=verifyProfile(profile,entry,detail),catalog={profiles:[dj]};
 const $=load(renderSite(currentMenu,{source:'github'},new Date(),catalog));
 assert.equal($('.event-card').length,currentMenu.events.length);
 const expected=currentMenu.events.filter(event=>matchArtist(event.description,[entry]));
 assert.equal($('.artist-link').length,expected.length);
 assert.equal($('.dj-profile').length,expected.length);
 $('.event-card').each((i,el)=>{
  const event=currentMenu.events[i],link=$(el).find('h3 a');
  assert.equal($(el).find('h3').text(),event.description);
  assert.equal(link.length,matchArtist(event.description,[entry])?1:0);
  if(link.length){assert.equal(link.text(),entry.name);assert.equal(link.attr('href'),entry.detailUrl);}
 });
});
