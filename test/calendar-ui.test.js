import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {lasVegasDate,weekRange,dateMatches,filterCalendar,globalSearchState,isRetainedEvent,defaultCalendarState,periodFromParams,calendarSearchParams} from '../src/calendar-filters.js';
import {renderSite} from '../src/site.js';
import {artistKey} from '../src/dj-catalog.js';
import menu from '../data/menu.json' with {type:'json'};
const now = new Date('2026-11-15T23:00:00Z');
const events = [
 {eventDate:'2026-11-14',weekEnding:'2026-11-15',section:'Nightclubs',days:['Saturday'],search:'alesso omnia'},
 {eventDate:'2026-11-19',weekEnding:'2026-11-22',section:'Nightclubs',days:['Thursday'],search:'alesso omnia'},
 {eventDate:'2026-12-04',weekEnding:'2026-12-06',section:'Nightclubs',days:['Friday'],search:'alesso omnia'},
 {eventDate:null,weekEnding:'2026-11-22',section:'After Parties',days:['Thursday'],search:'r&b party'}
];
test('date ranges use Las Vegas day and Monday-Sunday weeks across year boundaries',()=>{
 assert.equal(lasVegasDate(new Date('2026-11-16T07:59Z')),'2026-11-15');
 assert.equal(lasVegasDate(new Date('2026-11-16T08:01Z')),'2026-11-16');
 assert.deepEqual(weekRange('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
 assert.deepEqual(weekRange('2026-12-27',1),{start:'2026-12-28',end:'2027-01-03'});
 assert.equal(dateMatches({eventDate:'2027-01-03'},'This week','',new Date('2027-01-01T20:00Z')),true);
});
test('global search spans retained weeks while the default and reset use this week',()=>{
 assert.equal(filterCalendar(events,globalSearchState('Alesso'),now).length,3);
 assert.equal(filterCalendar(events,{...globalSearchState('Alesso'),period:'Next week'},now).length,1);
 assert.equal(filterCalendar(events,{...globalSearchState('Alesso'),date:'2026-12-04'},now).length,1);
 assert.equal(filterCalendar(events,globalSearchState(''),now).length,4);
 assert.equal(filterCalendar(events,defaultCalendarState(),now).length,1);
 assert.equal(filterCalendar(events,{},now).length,1);
 assert.equal(filterCalendar(events,{period:'Upcoming'},now).length,2);
 assert.equal(filterCalendar(events,{period:'This week'},now).length,1);
 assert.equal(filterCalendar(events,{date:'2026-11-19',query:'No match'},now).length,0);
});
test('explicit date filters never invent dates for recurring records',()=>{
 for(const period of ['Upcoming','This week','Next week'])assert.equal(dateMatches(events[3],period,'',now),false);
 assert.equal(dateMatches(events[3],'All','',now),true);
 assert.equal(dateMatches(events[3],'All','2026-11-19',now),false);
});
test('source compact arrival spelling still matches exact artist and nothing else',()=>{
 assert.equal(artistKey('Alesso (930pm arrival!)'),'alesso');
 assert.equal(artistKey('Alesso (9:30pm arrival!)'),'alesso');
 assert.notEqual(artistKey('Alesso (special guest)'),'alesso');
 assert.notEqual(artistKey('Alesso (1930pm arrival!)'),'alesso');
});
test('calendar rendering keeps original cards, date choices, source notice and existing sections',()=>{
 const event={...menu.events[0],eventDate:'2027-01-03',weekEnding:'2027-01-02',provisional:true,dateWarnings:['Explicit event date is outside the advertised week-ending window']};
 const recurring={...menu.events.at(-1),eventDate:null,weekEnding:'2027-01-02',provisional:true};
 const snapshot={schemaVersion:1,timeZone:'America/Los_Angeles',fetchedAt:'2026-11-15T23:00:00Z',menus:[{},{}],events:[event,recurring],warnings:[]};
 const $=load(renderSite({...menu,events:snapshot.events},{source:'github'},now,null,null,snapshot));
 assert.equal($('.event-card').length,2);assert.equal($('#filters[data-calendar]').length,1);
 assert.deepEqual($('[data-period]').map((_,e)=>$(e).text()).get(),['This week','Next week','Upcoming','All dates']);assert.equal($('[data-period][aria-pressed=true]').attr('data-period'),'This week');assert.equal($('#calendar-date option[value="2027-01-03"]').length,1);
 assert.match($('.event-date').first().text(),/Jan 3, 2027/);assert.match($('.event-date').first().text(),/Source week label: 2027-01-02/);
 assert.match($('.recurring').text(),/source week ending 2027-01-02/);
 assert.match($('.calendar-coverage').text(),/provisional/);assert.equal($('.source-notes #dress-code').length,1);
 assert.equal($('.personal-credit').text(),'Built by Sean with ❤️');
});


test('retention drops only earlier weeks at Las Vegas Monday, including DST and New Year',()=>{
 const sunday=new Date('2026-11-16T07:59:59Z'),monday=new Date('2026-11-16T08:00:00Z');
 assert.equal(isRetainedEvent(events[0],sunday),true);
 assert.equal(isRetainedEvent(events[0],monday),false);
 assert.equal(isRetainedEvent({eventDate:'2026-11-16'},new Date('2026-11-22T20:00Z')),true);
 assert.equal(isRetainedEvent({eventDate:null,weekEnding:'2026-11-15'},monday),false);
 assert.equal(isRetainedEvent({eventDate:null,weekEnding:'2026-11-22'},monday),true);
 for(const boundary of ['2026-03-09T07:00:00Z','2026-11-02T08:00:00Z']){
  const before=new Date(Date.parse(boundary)-1),after=new Date(boundary),previous={eventDate:lasVegasDate(before)};
  assert.equal(isRetainedEvent(previous,before),true);assert.equal(isRetainedEvent(previous,after),false);
 }
 const spillover={eventDate:'2027-01-03',weekEnding:'2027-01-02'};
 assert.equal(isRetainedEvent(spillover,new Date('2027-01-03T20:00Z')),true);
 assert.equal(isRetainedEvent(spillover,new Date('2027-01-04T08:00Z')),false);
 assert.equal(filterCalendar(events,globalSearchState('alesso'),monday).length,2);
 assert.equal(filterCalendar(events,{period:'All',date:'2026-11-14'},monday).length,0);
});

test('root, reset, explicit All dates and refined global search survive URL round trips',()=>{
 assert.equal(periodFromParams(new URLSearchParams()),'This week');
 assert.equal(periodFromParams(new URLSearchParams('q=Alesso')),'All');
 assert.equal(periodFromParams(new URLSearchParams('period=All')),'All');
 assert.equal(periodFromParams(new URLSearchParams('period=bad')),'This week');
 assert.equal(calendarSearchParams(defaultCalendarState()).toString(),'');
 for(const state of [defaultCalendarState(),globalSearchState('Alesso'),{...defaultCalendarState(),period:'All'},{...globalSearchState('Alesso'),period:'This week'},{...defaultCalendarState(),period:'Next week'},{...globalSearchState('Alesso'),date:'2026-12-04'}]){
  assert.equal(periodFromParams(calendarSearchParams(state)),state.period);
 }
});

test('static rendering excludes retired cards and date options without mutating source input',()=>{
 const old={...menu.events[0],eventDate:'2026-11-14',weekEnding:'2026-11-15'};
 const future={...menu.events[1],eventDate:'2026-11-19',weekEnding:'2026-11-22'};
 const snapshot={menus:[{},{}],events:[old,future],fetchedAt:now.toISOString()};
 const $=load(renderSite({...menu,events:snapshot.events},{source:'github'},new Date('2026-11-16T08:00Z'),null,null,snapshot));
 assert.equal($('.event-card').length,1);assert.equal($('.event-card').attr('data-event-date'),'2026-11-19');
 assert.equal($('#calendar-date option[value="2026-11-14"]').length,0);assert.equal(snapshot.events.length,2);
});
