import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {artistKey, matchArtist, renderDJProfile, CATALOG_URL} from '../src/dj-catalog.js';
import {parseCatalogIndex, verifyProfile, loadDJCatalog} from '../scripts/dj-catalog.mjs';
import {renderSite} from '../src/site.js';
import menu from '../data/menu.json' with {type:'json'};
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
 assert.match(html,/DJ MAG 2026/);assert.match(html,/#18/);assert.ok(!html.includes('<dt>From</dt>'));assert.ok(!html.includes('<dt>Best known for</dt>'));assert.ok(!html.includes('>null<'));assert.ok(!html.includes('Catalog record updated'));assert.ok(!html.includes('View DJ profile'));assert.ok(!html.includes('No DJ'));
 assert.ok(html.includes('Steve Aoki (9pm arrival!)'));assert.ok(html.includes(entry.detailUrl));assert.ok(!html.includes('<canvas'));
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

test('purple enrichment preserves outer cards and orders linked name, rank, From and unlabelled known-for',()=>{
 const dj={...verifyProfile(profile,entry,detail),origin:'Example place',bestKnownFor:'Verified work',styles:['Do not render style'],description:'Do not render generated summary'};
 const catalog={status:'ok',year:2026,matchedListingCount:1,profiles:[dj]};
 const html=renderSite(menu,{source:'github'},new Date('2026-11-15T12:00:00Z'),catalog);
 const $=load(html), cards=$('.event-card');
 assert.equal(cards.length,menu.events.length);assert.equal(cards.find('h3 a').length,0);
 cards.each((i,card)=>assert.equal($(card).find('h3').text(),menu.events[i].description));
 const panel=cards.filter((_,e)=>$(e).find('h3').text().startsWith('Steve Aoki')).find('.dj-profile');
 assert.deepEqual(panel.children().map((_,e)=>$(e).attr('class')).get(),['dj-name','dj-rank','dj-from','dj-known']);
 assert.equal(panel.find('.dj-name').attr('href'),entry.detailUrl);assert.equal(panel.find('.dj-name').text(),'Steve Aoki');
 assert.equal(panel.find('.dj-from').text(),'From Example place');assert.equal(panel.find('.dj-known').text(),'Verified work');
 assert.ok(!panel.text().includes('Best known for'));assert.ok(!panel.text().includes('Do not render'));assert.ok(!panel.text().includes('Catalog record updated'));assert.ok(!panel.text().includes('View DJ profile'));
 for(const description of ['R&B Party','HipHop/Top40','Kaskade']) assert.equal(renderDJProfile(description,catalog),'');
 assert.ok(!renderDJProfile('Steve Aoki',{profiles:[{...dj,origin:'<script>bad</script>'}]}).includes('<script>'));
});
