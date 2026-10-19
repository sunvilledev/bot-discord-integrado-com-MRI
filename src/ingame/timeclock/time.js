const { timeclock } = require('../config');

const WEEKDAY_FROM_NAME = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const WEEKDAY_LABELS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const WEEKDAY_FROM_PT = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  terça: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  sábado: 6,
};

function zonedParts(utcMs, timeZone = timeclock.timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const part of fmt.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    weekdayName: parts.weekday,
    weekday: WEEKDAY_FROM_NAME[parts.weekday] ?? 0,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(utcMs, timeZone) {
  const parts = zonedParts(utcMs, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

function fromZonedLocal(year, month, day, hour, minute, second, timeZone) {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  let utc = wallAsUtc;
  for (let i = 0; i < 3; i += 1) {
    utc = wallAsUtc - getTimeZoneOffsetMs(utc, timeZone);
  }
  return utc;
}

function addCalendarDays(year, month, day, days) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getDayStart(nowMs = Date.now(), timeZone = timeclock.timezone) {
  const parts = zonedParts(nowMs, timeZone);
  return fromZonedLocal(parts.year, parts.month, parts.day, 0, 0, 0, timeZone);
}

function getMonthStart(nowMs = Date.now(), timeZone = timeclock.timezone) {
  const parts = zonedParts(nowMs, timeZone);
  return fromZonedLocal(parts.year, parts.month, 1, 0, 0, 0, timeZone);
}

function getWeekStart(
  nowMs = Date.now(),
  timeZone = timeclock.timezone,
  resetWeekday = timeclock.resetWeekday,
  resetHour = timeclock.resetHour,
  resetMinute = timeclock.resetMinute,
) {
  const parts = zonedParts(nowMs, timeZone);
  const nowMinutes = parts.hour * 60 + parts.minute;
  const resetMinutes = resetHour * 60 + resetMinute;
  let daysBack = (parts.weekday - resetWeekday + 7) % 7;
  if (daysBack === 0 && nowMinutes < resetMinutes) {
    daysBack = 7;
  }
  const start = addCalendarDays(parts.year, parts.month, parts.day, -daysBack);
  return fromZonedLocal(start.year, start.month, start.day, resetHour, resetMinute, 0, timeZone);
}

function getWeekEnd(weekStartMs, timeZone = timeclock.timezone) {
  const parts = zonedParts(weekStartMs, timeZone);
  const next = addCalendarDays(parts.year, parts.month, parts.day, 7);
  return fromZonedLocal(
    next.year,
    next.month,
    next.day,
    timeclock.resetHour,
    timeclock.resetMinute,
    0,
    timeZone,
  );
}

function overlapMs(start, end, winStart, winEnd) {
  const from = Math.max(start, winStart);
  const to = Math.min(end, winEnd);
  return Math.max(0, to - from);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}min`);
  return parts.join(' ');
}

function formatDateTime(utcMs, timeZone = timeclock.timezone) {
  const parts = zonedParts(utcMs, timeZone);
  const dd = String(parts.day).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  const hh = String(parts.hour).padStart(2, '0');
  const min = String(parts.minute).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

function parseResetSpec(text) {
  const raw = String(text || '').trim().toLowerCase();
  const match = raw.match(/^([a-zçáéíóúãõ]+)\s+(\d{1,2}):(\d{2})$/i);
  if (!match) return null;
  const weekday = WEEKDAY_FROM_PT[match[1]];
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (weekday == null || hour > 23 || minute > 59) return null;
  return { weekday, hour, minute };
}

function describeReset() {
  const day = WEEKDAY_LABELS[timeclock.resetWeekday] || 'sábado';
  const hour = String(timeclock.resetHour).padStart(2, '0');
  const minute = String(timeclock.resetMinute).padStart(2, '0');
  return `${day} ${hour}:${minute}`;
}

module.exports = {
  zonedParts,
  getDayStart,
  getMonthStart,
  getWeekStart,
  getWeekEnd,
  overlapMs,
  formatDuration,
  formatDateTime,
  parseResetSpec,
  describeReset,
};
