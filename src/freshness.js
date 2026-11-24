import { lasVegasDate } from './calendar-filters.js';
import { createTranslator, DEFAULT_LOCALE } from './messages.js';

export function getFreshnessStatus(weekEnding, { calendar = false, fallback = false, pages = false, now = new Date() } = {}) {
  if (fallback) return { warning: true, key: 'backup' };
  if (!Number.isFinite(Date.parse(`${weekEnding}T12:00:00Z`))) return { warning: true, key: 'unknown' };
  if (lasVegasDate(now) > weekEnding) return { warning: true, key: calendar ? 'older' : 'past' };
  return { warning: false, key: pages ? 'published' : 'current' };
}

export function freshness(weekEnding, now = new Date()) {
  const { warning, key } = getFreshnessStatus(weekEnding, { now });
  const t = createTranslator(DEFAULT_LOCALE);
  return {
    warning,
    label: t(`freshness.${key}`),
    explanation: t(key === 'past' ? 'freshness.runtimePastExplanation' : `freshnessExplanation.${key}`)
  };
}
