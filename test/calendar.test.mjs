import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCalendar, discoverMenus, resolveEventDate, syncCalendar, INDEX_URL } from '../scripts/menu-calendar.mjs';
import { SOURCE_URL } from '../scripts/menu-source.mjs';
const future = 'https://halfsaintvegas.com/pages/we-01-02-27-party-menu-nye';
const links = `<a href="${SOURCE_URL}">Week Ending 11-15-26</a><a href="${future}">Week Ending 01-02-27 (NYE)</a>`;
const page = (title, date, link = '') => `<h1>${title}</h1><div class="PageContent Rte"><h2>Dayclubs</h2><p>DAY VENUE<br>Free.<br>${date} – DJ Test</p><h2>Nightclubs</h2><p>NIGHT VENUE<br>Terms TBD.<br>Monday - Sunday – Recurring</p>${link}</div>`;
const current = page("THIS WEEK'S PARTY MENU", 'Saturday, 11/14', links);
const upcoming = `<h1>UPCOMING EVENTS</h1><div class="PageContent Rte">${links}</div>`;
const next = page('WE 01-02-27 PARTY MENU (NYE)', 'Sunday, 1/3');
const now = '2026-11-15T12:00:00.000Z';
const docs = new Map([[SOURCE_URL,current],[INDEX_URL,upcoming],[future,next]]);
const event = { section:'Nightclubs',venue:'OMNIA',details:'Free',dateText:'Saturday, 11/14',description:'Alesso' };
const menu = (url,week='2026-11-15',events=[event]) => ({sourceUrl:url,weekEnding:week,fetchedAt:now,events,isCurrent:url===SOURCE_URL,sourceTitle:'Title',linkLabel:'Week Ending 11-15-26'});

test('resolves cross-year explicit dates, preserves Jan3 warning, and never expands recurrence',()=>{
 assert.equal(resolveEventDate('Thursday, 12/31','2027-01-02').eventDate,'2026-12-31');
 assert.equal(resolveEventDate('Friday, 1/1','2027-01-02').eventDate,'2027-01-01');
 const d=resolveEventDate('Sunday, 1/3','2027-01-02');assert.equal(d.eventDate,'2027-01-03');assert.equal(d.dateWarnings.length,1);
 assert.equal(resolveEventDate('Monday - Sunday','2027-01-02').eventDate,null);
 assert.equal(resolveEventDate('Sunday, 2/30','2027-02-28').dateStatus,'unresolved');
 assert.equal(resolveEventDate('Saturday, 1/3','2027-01-02').dateStatus,'unresolved');
 assert.equal(resolveEventDate('Sunday, 1/3',null).dateStatus,'unresolved');
});
test('dedups exact alias events with provenance but preserves conflicting terms and week-scoped recurrence',()=>{
 const recurrence={...event,dateText:'Monday - Sunday'};
 const x=buildCalendar([menu(SOURCE_URL),menu('https://halfsaintvegas.com/pages/we-11-15-26-party-menu','2026-11-15',[{...event,dateText:'Saturday 11/14'}]),menu(future,'2026-11-15',[{...event,details:'Paid'},recurrence]),menu(future,'2026-11-22',[recurrence])],now);
 assert.equal(x.events.length,4);assert.equal(x.events[0].sources.length,2);assert.equal(x.events[0].provisional,false);
 assert.equal(x.events[1].provisional,true);assert.equal(x.events[2].eventDate,null);
 assert.equal(buildCalendar([menu(SOURCE_URL)],now).events[0].id,x.events[0].id);
});
test('discovers only explicit same-host menu links and rejects unapproved destinations',()=>{
 assert.equal(discoverMenus(upcoming,INDEX_URL).length,2);
 for(const href of ['https://evil.example/pages/we-11-22-26-party-menu','/pages/contact','/pages/we-11-22-26-party-menu?token=x']){
  assert.throws(()=>discoverMenus(`<div class="PageContent Rte"><a href="${href}">Week Ending 11-22-26</a></div>`,INDEX_URL),/Disallowed/);
 }
 assert.throws(()=>discoverMenus('<div class="PageContent Rte"><a href="/pages/we-02-30-26-party-menu">Week Ending 02-30-26</a></div>',INDEX_URL),/Invalid/);
});
test('sync fetches current/index once, deduplicates links, records complete snapshots and atomically writes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'calendar-'));const counts=new Map();
 try{const path=join(dir,'calendar.json');const calendar=await syncCalendar({path,now,fetchImpl:async(url,options)=>{counts.set(url,(counts.get(url)||0)+1);assert.equal(options.redirect,'error');return new Response(docs.get(url));}});
 assert.equal(calendar.menus.length,2);assert.equal(calendar.discovery.rawEventCount,4);assert.deepEqual([...counts.values()],[1,1,1]);assert.equal(calendar.events[2].eventDate,'2027-01-03');assert.equal(calendar.warnings.length,1);assert.deepEqual(JSON.parse(await readFile(path,'utf8')),calendar);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('failed or malformed future source preserves prior calendar and never retries authorization errors',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'calendar-'));
 try{const path=join(dir,'calendar.json');for(const fail of [new Response('Forbidden',{status:403}),new Response('<h1>broken</h1>'),new Response(page('WE 01-03-27 PARTY MENU','Sunday, 1/3'))]){
 await writeFile(path,'previous');let attempts=0;await assert.rejects(syncCalendar({path,now,fetchImpl:async url=>{if(url===future){attempts++;return fail;}return new Response(docs.get(url));}}));assert.equal(attempts,1);assert.equal(await readFile(path,'utf8'),'previous');}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('limits discovery to twenty source menus before fetching future pages',async()=>{
 const extra=Array.from({length:21},(_,i)=>`<a href="/pages/we-11-22-26-party-menu-${i}">Week Ending 11-22-26</a>`).join('');let calls=0;
 await assert.rejects(syncCalendar({now,fetchImpl:async url=>{calls++;return new Response(url===SOURCE_URL?current:`<div class="PageContent Rte">${extra}</div>`);}}),/Too many/);assert.equal(calls,2);
});

test('future fetching concurrency never exceeds three and partial categories fail closed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'calendar-'));let active=0,max=0;
 const refs=Array.from({length:6},(_,i)=>({url:`https://halfsaintvegas.com/pages/we-01-02-27-party-menu-${i}`,label:'Week Ending 01-02-27'}));
 const allLinks=links+refs.map(r=>`<a href="${r.url}">${r.label}</a>`).join('');
 try{await syncCalendar({path:join(dir,'calendar.json'),now,fetchImpl:async url=>{
 if(url===SOURCE_URL)return new Response(current);
 if(url===INDEX_URL)return new Response(`<div class="PageContent Rte">${allLinks}</div>`);
 active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(next);
 }});assert.equal(max,3);
 await writeFile(join(dir,'calendar.json'),'previous');
 await assert.rejects(syncCalendar({path:join(dir,'calendar.json'),now,fetchImpl:async url=>new Response(url===future?'<h1>WE 01-02-27 PARTY MENU</h1><div class="PageContent Rte"><h2>Dayclubs</h2><p>VENUE<br>Friday – Party</p><h2>Nightclubs</h2></div>':docs.get(url))}),/incomplete/);
 assert.equal(await readFile(join(dir,'calendar.json'),'utf8'),'previous');
 }finally{await rm(dir,{recursive:true,force:true});}
});
