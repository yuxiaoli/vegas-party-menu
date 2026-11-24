// Translate complete, recognized source clauses so a new qualifier is never dropped.
const audiences = new Map([
  ['girls and guys', '女士和男士均'],
  ['ladies and gentlemen', '女士和男士均'],
  ['women and men', '女士和男士均'],
  ['men and women', '男士和女士均'],
  ['girls', '女士'],
  ['ladies', '女士'],
  ['women', '女士'],
  ['guys', '男士'],
  ['gentlemen', '男士'],
  ['men', '男士'],
  ['all guests', '所有宾客'],
  ['everyone', '所有人'],
]);
const audience = `(${[...audiences.keys()].join('|')})`;
const who = value => audiences.get(value.toLowerCase());

const allDays = [
  [/^mon(?:day)?$/i, '周一'],
  [/^tue(?:s(?:day)?)?$/i, '周二'],
  [/^wed(?:s|nesday)?$/i, '周三'],
  [/^thu(?:rs?|rsday)?$/i, '周四'],
  [/^fri(?:day)?$/i, '周五'],
  [/^sat(?:urday)?$/i, '周六'],
  [/^sun(?:day)?$/i, '周日'],
];

function days(value) {
  const ranges = value.split(/\s*[/,]\s*|\s+and\s+/i).map(range =>
    range.split(/\s*[-–—]\s*|\s+through\s+/i).map(day =>
      allDays.find(([pattern]) => pattern.test(day))?.[1]
    )
  );
  if (ranges.some(range => !range.every(Boolean))) return null;
  return ranges.map(range => range.join('至')).join('、');
}

const clock = '(?:\\d{1,2}(?::?[0-5]\\d)?\\s*[ap]m|(?:[01]?\\d|2[0-3]):[0-5]\\d)';
const schedulePattern = new RegExp(
  `^(?:(till|until) )?(${clock}|\\d{1,2})(?:\\s*(?:[-–—]|to)\\s*(${clock}))?(?: (.+))?$`,
  'i',
);

function time(value) {
  const period = value.match(/^(\d{1,2})(?::?([0-5]\d))?\s*([ap])m$/i);
  if (!period) return /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value) ? value.padStart(5, '0') : null;
  const [, hour, minutes = '00', half] = period;
  if (+hour < 1 || +hour > 12) return null;
  const hours = +hour % 12 + (half.toLowerCase() === 'p' ? 12 : 0);
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function schedule(value) {
  const match = value.match(schedulePattern);
  if (!match) return null;
  const [, until, start, end, dayText] = match;
  const when = dayText ? days(dayText.replace(/^on /i, '')) : '';
  if (when === null) return null;
  const sharedPeriod = /^\d{1,2}$/.test(start) && end?.match(/[ap]m$/i)?.[0];
  const startTime = time(sharedPeriod ? start + sharedPeriod : start);
  const endTime = end && time(end);
  if (!startTime || (end && !endTime)) return null;
  if (endTime) {
    // For shorthand with only one AM/PM marker, avoid inferring an overnight start time.
    if (sharedPeriod && startTime > endTime) return null;
    const overnight = startTime > endTime ? '次日 ' : '';
    return `${when ? when + ' ' : ''}${startTime}–${overnight}${endTime}${until ? '（原文在时段前标注“截至”）' : ''}`;
  }
  return `${when ? when + ' ' : ''}${until ? '截至 ' : ''}${startTime}`;
}

const scheduleText = (value, prefix) => {
  const formatted = schedule(value);
  return formatted && `${prefix}${formatted}`;
};

const price = '\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?|\\$\\s?\\d+(?:\\.\\d{2})?';
const ticketPrice = `(${price})(?:\\s*(?:[-–—]|to)\\s*(${price}))?`;
const amount = (base, end) => end ? `${base}–${end}` : base;

function freeAdmission(person, condition) {
  const base = `${who(person)}可免费入场`;
  if (!condition) return base;
  if (/^no ratio needed$/i.test(condition)) return `${base}，无人数比例要求`;
  if (/^with any girl in (?:the )?group$/i.test(condition)) return `${base}，须同组至少有一位女士`;
  const ratio = condition.match(/^w(?:\/|ith) (\d+\s*:\s*\d+) ratio$/i);
  if (ratio) return `${base}，须满足 ${ratio[1]} 的人数比例`;
  const early = condition.match(/^with (very )?early arrival(?: (.+))?$/i);
  if (early) {
    const when = early[2] ? days(early[2]) : '';
    return when === null ? null : `${who(person)}${when}${early[1] ? '须很早' : '须提前'}到场方可免费入场`;
  }
  const cutoff = condition.match(/^before (.+)$/i);
  if (cutoff) {
    const until = schedule(cutoff[1]);
    return until && `${who(person)}在 ${until} 前可免费入场`;
  }
  const except = condition.match(/^except (.+)$/i);
  const when = days(except ? except[1] : condition);
  return when && `${base}（${when}${except ? '除外' : ''}）`;
}

const dressStyles = new Map([
  ['smart casual', '精致休闲装'],
  ['upscale casual', '高档休闲装'],
  ['business casual', '商务休闲装'],
  ['cocktail attire', '鸡尾酒会着装'],
  ['formal attire', '正式着装'],
  ['upscale nightlife attire', '高档夜店着装'],
  ['swimwear', '泳装'],
  ['casual', '休闲装'],
]);
const clothes = new Map([
  ['athletic wear', '运动服'],
  ['sportswear', '运动服'],
  ['sports jerseys', '运动球衣'],
  ['jerseys', '球衣'],
  ['gym shorts', '运动短裤'],
  ['shorts', '短裤'],
  ['hats', '帽子'],
  ['caps', '帽子'],
  ['baseball caps', '棒球帽'],
  ['tank tops', '背心'],
  ['sneakers', '运动鞋'],
  ['sandals', '凉鞋'],
  ['flip-flops', '人字拖'],
  ['swimwear', '泳装'],
  ['torn jeans', '破洞牛仔裤'],
  ['baggy clothing', '过于宽松的衣服'],
]);

function noClothes(value) {
  const names = value.toLowerCase().split(/\s+(?:or|and)\s+|,\s*(?:(?:or|and)\s+)?/).map(item => clothes.get(item));
  return names.every(Boolean) ? `禁止穿戴${names.join('、')}` : null;
}

function dressCode(value) {
  const [style, ...restrictions] = value.toLowerCase().split(/,\s*no /);
  if (!dressStyles.has(style)) return null;
  const clauses = restrictions.map(noClothes);
  if (clauses.some(clause => clause === null)) return null;
  return [`着装要求：${dressStyles.get(style)}`, ...clauses].join('，');
}

const ageCondition = '(?:ages? |(?:guests )?must be )?(\\d{2})(?:\\+| or older| and over)(?: only| to enter)?';
const idType = '(valid )?(government[- ]issued )?(photo )?ID';
const ageLimit = age => `仅限年满 ${age} 岁者入场`;
const proofOfIdentity = (valid, government, photo) =>
  `须出示${valid ? '有效的' : ''}${government ? '政府签发的' : ''}${photo ? '带照片的' : ''}身份证件`;
const entryPrice = '(?:cover(?: charge)?|entry(?: fee)?|admission(?: fee)?|tickets?)';

const rules = [
  [/^\d+(?: [NSEW]\.?)? [A-Za-z0-9 .'-]+ (?:Rd|St|Ave|Blvd|Dr|Way|Ln)\.?$/i, address => `地址：${address}`],
  [/^Located on the (\d+)(?:st|nd|rd|th) floor$/i, (_, floor) => `位于 ${floor} 楼`],
  [new RegExp(`^${audience} free (.+); pay reduced (.+)$`, 'i'), (_, guests, qualifier, reducedDays) => {
    const free = freeAdmission(guests, qualifier);
    const when = days(reducedDays);
    return free && when && `${free}；${when}享优惠入场价`;
  }],
  [new RegExp(`^${audience} (?:are )?free(?: (?:admission|entry))?(?: (.+))?$`, 'i'), (_, guests, qualifier) => freeAdmission(guests, qualifier)],
  [new RegExp(`^${audience} pay reduced (.+)$`, 'i'), (_, guests, when) => days(when) && `${who(guests)}${days(when)}享优惠入场价`],
  [new RegExp(`^${audience} open bar free drinks (.+)$`, 'i'), (_, guests, when) => scheduleText(when, `${who(guests)}可在吧台享用免费酒水，时段：`)],
  [/^open bar free drinks (.+)$/i, (_, when) => scheduleText(when, '吧台供应免费酒水，时段：')],
  [new RegExp(`^${audience} (\\d+) free drink tickets?$`, 'i'), (_, guests, count) => `${who(guests)}可领取 ${count} 张免费酒水券`],
  [new RegExp(`^${audience} drink tickets (.+); open bar free drinks (.+)$`, 'i'), (_, guests, ticketDays, barHours) => {
    const when = days(ticketDays);
    const hours = schedule(barHours);
    return when && hours && `${who(guests)}${when}可领取酒水券；吧台供应免费酒水，时段：${hours}`;
  }],
  [new RegExp(`^${audience} drink tickets (.+)$`, 'i'), (_, guests, when) => days(when) && `${who(guests)}${days(when)}可领取酒水券`],
  [new RegExp(`^${audience} complimentary champagne (.+)$`, 'i'), (_, guests, when) => scheduleText(when, `${who(guests)}可免费领取香槟，时段：`)],
  [/^(?:guest ?)?list:? (.+)$/i, (_, when) => scheduleText(when, '宾客名单适用时间：')],
  [/^(?:guests )?must arrive using in-house transportation \(or self drive\)$/i, () => '须乘坐场馆提供的交通工具或自行驾车抵达'],
  [new RegExp(`^${entryPrice}(?: (?:is|are))?:? (starting at |from )?${ticketPrice}(?: (before|after) (${clock}))?$`, 'i'),
    (_, startingAt, base, end, timing, cutoff) => {
      const when = cutoff ? time(cutoff) : '';
      if (cutoff && !when) return null;
      const qualifier = when ? `（${when} ${timing.toLowerCase() === 'before' ? '前' : '后'}）` : '';
      return `票价：${amount(base, end)}${startingAt ? '起' : ''}${qualifier}`;
    }],
  [new RegExp(`^${ticketPrice} ${entryPrice}$`, 'i'), (_, base, end) => `票价：${amount(base, end)}`],
  [new RegExp(`^free (?:entry |admission )?before (${clock})$`, 'i'), (_, until) => scheduleText(until, '免费入场截止时间：')],
  [/^(?:free (?:entry|admission)|no cover(?: charge)?)$/i, () => '免费入场'],
  [/^free (?:entry|admission) with (?:an? )?(RSVP|guest ?list registration)$/i, (_, requirement) =>
    `免费入场，${/^rsvp$/i.test(requirement) ? '须提前回复确认出席' : '须登记宾客名单'}`],
  [new RegExp(`^${ageCondition}$`, 'i'), (_, age) => ageLimit(age)],
  [new RegExp(`^${ageCondition} with (?:an? )?${idType}$`, 'i'),
    (_, age, ...id) => `${ageLimit(age)}，${proofOfIdentity(...id)}`],
  [new RegExp(`^${idType} (?:is )?required$`, 'i'), (_, ...id) => proofOfIdentity(...id)],
  [new RegExp(`^(?:guests )?must (?:show|present) (?:an? )?${idType}$`, 'i'), (_, ...id) => proofOfIdentity(...id)],
  [/^dress code:? (.+)$/i, (_, dress) => dressCode(dress)],
  [/^dress code (?:is )?enforced$/i, () => '须遵守着装要求'],
  [/^no (.+)$/i, (_, items) => noClothes(items)],
  [/^(?:guest ?list only|(?:guests )?must be on (?:the )?guest ?list)$/i, () => '仅限宾客名单上的人员入场'],
  [/^(?:guest ?list|RSVP|reservation) (?:is )?required$/i, clause =>
    /^RSVP/i.test(clause) ? '须提前回复确认出席' : /^reservation/i.test(clause) ? '须提前预约' : '须登记宾客名单'],
  [/^guest ?list closes at (.+)$/i, (_, until) => scheduleText(until, '宾客名单登记截止时间：')],
  [/^doors open at (.+)$/i, (_, opening) => scheduleText(opening, '开门时间：')],
  [/^subject to (?:capacity|availability)$/i, clause =>
    /capacity$/i.test(clause) ? '入场视场馆容量而定' : '视现场余位而定'],
  [/^no re-?entry$/i, () => '离场后不得再次入场'],
  [/^cash only$/i, () => '仅收现金'],
];

function translateClause(value) {
  const normalized = value
    .replace(/\s+/g, ' ')
    .replace(/(\d\s*)([ap])\.m\.?/gi, '$1$2m');
  for (const [pattern, translate] of rules) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const translated = translate(...match);
    if (translated) return translated;
  }
  return null;
}

function splitClauses(details) {
  const clauses = [];
  let start = 0;
  for (const match of details.matchAll(/[.;](?=\s|$)|[；。]|\r?\n/g)) {
    const end = match.index;
    const after = details.slice(end + 1);
    // These offers continue the subject of the preceding clause.
    if (match[0] === ';' && /^\s*(?:pay reduced|open bar free drinks)\b/i.test(after)) continue;
    if (match[0] === '.') {
      const before = details.slice(start, end);
      const clockPeriod = /\d\s*[ap]\.m$/i.test(before);
      const scheduleContinues = /^\s*(?:[-–—]|to\b|(?:on\s+)?(?:mon|tue|wed|thu|fri|sat|sun))/i.test(after);
      if (clockPeriod && scheduleContinues) continue;
      if (!clockPeriod && /\b[A-Z]$/.test(before) && after.trim()) continue; // Address initial.
      if (/\b(?:e\.g|i\.e)$/i.test(before) && after.trim()) continue;
    }
    clauses.push(details.slice(start, end));
    start = end + match[0].length;
  }
  clauses.push(details.slice(start));
  return clauses.map(clause => clause.trim()).filter(Boolean);
}

export function translateEntryDetails(details) {
  if (!details?.trim()) return { parts: [], complete: true };
  const parts = splitClauses(details).map(text => {
    const translation = translateClause(text);
    return translation ? { text: translation, translated: true } : { text, translated: false };
  });
  if (!parts.some(part => part.translated)) return { parts: [{ text: details, translated: false }], complete: false };
  return { parts, complete: parts.every(part => part.translated) };
}
