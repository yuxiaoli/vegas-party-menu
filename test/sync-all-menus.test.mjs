import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {syncAllMenus} from '../scripts/sync-all-menus.mjs';
import {SOURCE_URL} from '../scripts/menu-source.mjs';
import {INDEX_URL} from '../scripts/menu-calendar.mjs';
const next='https://halfsaintvegas.com/pages/we-11-22-26-party-menu';
const links=`<a href="${SOURCE_URL}">Week Ending 11-15-26</a><a href="${next}">Week Ending 11-22-26</a>`;
const page=(title,day,extra='')=>`<h1>${title}</h1><div class="PageContent Rte"><h2>Dayclubs</h2><p>VENUE<br>Free.<br>Saturday, 11/${day} – Artist</p><h2>Nightclubs</h2><p>CLUB<br>Thursday - Sunday – Party</p>${extra}</div>`;
const docs=new Map([[SOURCE_URL,page("THIS WEEK'S PARTY MENU",14,links)],[INDEX_URL,`<div class="PageContent Rte">${links}</div>`],[next,page('WE 11-22-26 PARTY MENU',21)]]);
const now='2026-11-15T23:00:00.000Z';
async function setup(){const dir=await mkdtemp(join(tmpdir(),'sync-all-'));const menuPath=join(dir,'menu.json'),calendarPath=join(dir,'calendar.json');await writeFile(menuPath,'old menu');await writeFile(calendarPath,'old calendar');return{dir,menuPath,calendarPath};}
test('one collection feeds both files with exactly the six legacy fields',async()=>{
 const p=await setup(),calls=new Map();try{const x=await syncAllMenus({...p,now,fetchImpl:async url=>{calls.set(url,(calls.get(url)||0)+1);return new Response(docs.get(url));}});
 assert.deepEqual([...calls.values()],[1,1,1]);assert.deepEqual(Object.keys(x.menu),['sourceUrl','fetchedAt','weekEnding','sections','events','links']);assert.deepEqual(x.menu.events,x.calendar.menus.find(m=>m.isCurrent).events);assert.deepEqual(JSON.parse(await readFile(p.menuPath)),x.menu);assert.deepEqual(JSON.parse(await readFile(p.calendarPath)),x.calendar);assert.deepEqual((await readdir(p.dir)).sort(),['calendar.json','menu.json']);
 }finally{await rm(p.dir,{recursive:true,force:true});}
});
test('future collection/validation failure leaves BOTH prior files unchanged',async()=>{
 for(const response of [()=>new Response('Forbidden',{status:403}),()=>new Response('<h1>partial</h1>')]){
 const p=await setup();let tries=0;try{await assert.rejects(syncAllMenus({...p,now,fetchImpl:async url=>{if(url===next){tries++;return response();}return new Response(docs.get(url));}}));assert.equal(tries,1);assert.equal(await readFile(p.menuPath,'utf8'),'old menu');assert.equal(await readFile(p.calendarPath,'utf8'),'old calendar');assert.deepEqual((await readdir(p.dir)).sort(),['calendar.json','menu.json']);}finally{await rm(p.dir,{recursive:true,force:true});}}
});
test('second target replacement failure restores previous calendar',async()=>{
 const p=await setup();try{await rm(p.menuPath);await mkdir(p.menuPath);await assert.rejects(syncAllMenus({...p,now,fetchImpl:async url=>new Response(docs.get(url))}));assert.equal(await readFile(p.calendarPath,'utf8'),'old calendar');assert.deepEqual((await readdir(p.dir)).sort(),['calendar.json','menu.json']);}finally{await rm(p.dir,{recursive:true,force:true});}
});
