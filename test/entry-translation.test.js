import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateEntryDetails } from '../src/entry-translation.js';

// Distinct conditions from the menu/calendar snapshots and prior weekly snapshots.
const sourceConditions = [
  '2245 E Flamingo Rd. Girls and guys free. List 10pm - 3am',
  'Girls and guys free',
  'Girls and guys free Friday',
  'Girls and guys free no ratio needed. List 10pm - 3am',
  'Girls and guys free no ratio needed. List till 6am. Must arrive using in-house transportation (or self drive)',
  'Girls and guys free with early arrival',
  'Girls and guys free with early arrival. Girls open bar free drinks till 1230am',
  'Girls and guys free with early arrival. Girls open bar free drinks till 1230am Sat/Sun',
  'Girls and guys free with very early arrival',
  'Girls and guys free. Girls drink tickets Wednesday; open bar free drinks 1130pm - 1230am Fri/Sat',
  'Girls and guys free. Girls drink tickets Wednesday; open bar free drinks 1130pm - 1230am Monday/Friday',
  'Girls and guys free. Girls drink tickets Wednesday; open bar free drinks 1130pm - 1230am Monday/Friday/Saturday',
  'Girls and guys free. Girls drink tickets Wednesday; open bar free drinks 1130pm - 1230am Thurs-Sat',
  'Girls and guys free. Girls open bar free drinks 1130pm - 1230am',
  'Girls and guys free. Girls open bar free drinks 1130pm - 1230am Fri-Sun',
  'Girls and guys free. Girls open bar free drinks 12am - 1am',
  'Girls and guys free. Girls open bar free drinks 1pm - 2pm',
  'Girls and guys free. List till 6pm - 6am. Guests must arrive using in-house transportation (or self drive)',
  'Girls free except Sat. Guys free with early arrival Fri/Sun; pay reduced Thurs',
  'Girls free. Guys free w/ 1:1 ratio. List 1am - 330am',
  'Girls free. Guys free w/ 1:1 ratio. List 1am - 3am. Girls complimentary champagne 1-2am',
  'Girls free. Guys free with any girl in group',
  'Located on the 55th Floor. Girls and guys free',
  'Located on the 55th Floor. Girls and guys free. Girls 1 free drink ticket',
];

test('translates the collected entry conditions without changing party qualifiers or overnight hours', () => {
  for (const source of sourceConditions) {
    const result = translateEntryDetails(source);
    assert.equal(result.complete, true, source);
    assert.ok(result.parts.every(part => part.translated && /\p{Script=Han}/u.test(part.text)), source);
  }
  const ratio = translateEntryDetails(sourceConditions[20]).parts.map(part => part.text);
  assert.match(ratio[0], /女士可免费/);
  assert.match(ratio[1], /男士可免费.*1:1/);
  assert.match(ratio[2], /名单.*01:00–03:00/);
  assert.match(ratio[3], /香槟.*01:00–02:00/);
  const overnight = translateEntryDetails(sourceConditions[12]).parts.map(part => part.text).join('。');
  assert.match(overnight, /周三.*酒水券/);
  assert.match(overnight, /周四至周六 23:30–次日 00:30/);
});

test('translates newly encountered prices, age, ID, dress, list and opening conditions', () => {
  const source = 'Tickets: $25.50 before 10 p.m. 21+ with a valid government-issued photo ID. '
    + 'Dress code: smart casual, no shorts, no hats. Guest list required. Cash only. Doors open at 12 p.m.';
  const { parts, complete } = translateEntryDetails(source);
  assert.equal(complete, true);
  assert.deepEqual(parts.map(part => part.text), [
    '票价：$25.50（22:00 前）',
    '仅限年满 21 岁者入场，须出示有效的政府签发的带照片的身份证件',
    '着装要求：精致休闲装，禁止穿戴短裤，禁止穿戴帽子',
    '须登记宾客名单',
    '仅收现金',
    '开门时间：12:00',
  ]);
  const range = translateEntryDetails('Guest list: 11:30p.m. - 12:30 a.m. on Friday');
  assert.deepEqual(range.parts.map(part => part.text), ['宾客名单适用时间：周五 23:30–次日 00:30']);
  const address = translateEntryDetails('2245 E. Flamingo Rd. Doors open at 12 a.m.');
  assert.deepEqual(address.parts.map(part => part.text), ['地址：2245 E. Flamingo Rd', '开门时间：00:00']);
});

test('unrecognized conditions remain visible without asserting partial eligibility', () => {
  const partial = translateEntryDetails('Guests must be 21+. Girls and guys free with a signed costume waiver.');
  assert.deepEqual(partial, {
    parts: [
      { text: '仅限年满 21 岁者入场', translated: true },
      { text: 'Girls and guys free with a signed costume waiver', translated: false },
    ],
    complete: false,
  });
  const unknown = 'Dress code: smart casual, no shorts, no flare-stitched lapels. See https://example.com/a;b.html.';
  assert.deepEqual(translateEntryDetails(unknown), {
    parts: [{ text: unknown, translated: false }],
    complete: false,
  });
  assert.equal(translateEntryDetails('Guest list: 11–2am').complete, false);
  assert.deepEqual(translateEntryDetails(''), { parts: [], complete: true });
});
