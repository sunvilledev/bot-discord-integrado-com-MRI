const { db, setSetting } = require('../db');
const { timeclock } = require('../config');
const { getDayStart, getMonthStart, getWeekStart, getWeekEnd, overlapMs } = require('./time');

function purgeOldSessions(nowMs = Date.now()) {
  const cutoff = nowMs - timeclock.retentionDays * 24 * 60 * 60 * 1000;
  db.prepare(`
    DELETE FROM timeclock_sessions
    WHERE (ended_at IS NOT NULL AND ended_at < ?)
       OR (ended_at IS NULL AND started_at < ?)
  `).run(cutoff, cutoff);
}

function getOpenSession(userId) {
  return db.prepare(`
    SELECT id, user_id AS userId, started_at AS startedAt, ended_at AS endedAt
    FROM timeclock_sessions
    WHERE user_id = ? AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `).get(String(userId)) || null;
}

function listOpenSessions() {
  return db.prepare(`
    SELECT id, user_id AS userId, started_at AS startedAt
    FROM timeclock_sessions
    WHERE ended_at IS NULL
    ORDER BY started_at ASC
  `).all();
}

function startSession(userId, nowMs = Date.now()) {
  const existing = getOpenSession(userId);
  if (existing) return { error: 'Você já está com o ponto aberto.', session: existing };
  const result = db.prepare(`
    INSERT INTO timeclock_sessions (user_id, started_at) VALUES (?, ?)
  `).run(String(userId), nowMs);
  return {
    session: {
      id: result.lastInsertRowid,
      userId: String(userId),
      startedAt: nowMs,
    },
  };
}

function stopSession(userId, nowMs = Date.now()) {
  const existing = getOpenSession(userId);
  if (!existing) return { error: 'Você não tem ponto aberto.' };
  const duration = Math.max(0, nowMs - existing.startedAt);
  db.prepare(`
    UPDATE timeclock_sessions
    SET ended_at = ?, duration_ms = ?
    WHERE id = ?
  `).run(nowMs, duration, existing.id);
  return {
    session: {
      ...existing,
      endedAt: nowMs,
      durationMs: duration,
    },
  };
}

function sessionsOverlapping(winStart, winEnd) {
  return db.prepare(`
    SELECT user_id AS userId, started_at AS startedAt, ended_at AS endedAt
    FROM timeclock_sessions
    WHERE started_at < ? AND (ended_at IS NULL OR ended_at > ?)
  `).all(winEnd, winStart);
}

function totalInWindow(userId, winStart, winEnd, nowMs = Date.now()) {
  let total = 0;
  for (const row of sessionsOverlapping(winStart, winEnd)) {
    if (String(row.userId) !== String(userId)) continue;
    const end = row.endedAt == null ? nowMs : row.endedAt;
    total += overlapMs(row.startedAt, end, winStart, winEnd);
  }
  return total;
}

function getUserTotals(userId, nowMs = Date.now()) {
  const open = getOpenSession(userId);
  const dayStart = getDayStart(nowMs);
  const weekStart = getWeekStart(nowMs);
  const weekEnd = getWeekEnd(weekStart);
  const monthStart = getMonthStart(nowMs);
  return {
    open,
    openMs: open ? nowMs - open.startedAt : 0,
    dayMs: totalInWindow(userId, dayStart, nowMs, nowMs),
    weekMs: totalInWindow(userId, weekStart, Math.min(weekEnd, nowMs), nowMs),
    monthMs: totalInWindow(userId, monthStart, nowMs, nowMs),
    weekStart,
    weekEnd,
  };
}

function getWeeklyRankForStart(weekStart, nowMs = Date.now()) {
  const weekEnd = getWeekEnd(weekStart);
  const end = Math.min(weekEnd, nowMs);
  const totals = new Map();
  for (const row of sessionsOverlapping(weekStart, end)) {
    const sessionEnd = row.endedAt == null ? nowMs : row.endedAt;
    const ms = overlapMs(row.startedAt, sessionEnd, weekStart, end);
    if (ms <= 0) continue;
    totals.set(row.userId, (totals.get(row.userId) || 0) + ms);
  }
  const ranking = [...totals.entries()]
    .map(([userId, ms]) => ({ userId, ms }))
    .sort((a, b) => b.ms - a.ms);
  return { weekStart, weekEnd, ranking };
}

function getWeeklyRank(nowMs = Date.now()) {
  return getWeeklyRankForStart(getWeekStart(nowMs), nowMs);
}

function getMessage(kind) {
  return db.prepare(`
    SELECT kind, channel_id AS channelId, message_id AS messageId
    FROM timeclock_messages
    WHERE kind = ?
  `).get(kind) || {};
}

function setMessage(kind, { channelId, messageId }) {
  db.prepare(`
    INSERT INTO timeclock_messages (kind, channel_id, message_id) VALUES (?, ?, ?)
    ON CONFLICT(kind) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id
  `).run(kind, channelId || '', messageId || '');
  if (kind === 'panel' && channelId) setSetting('timeclock_channel_id', channelId);
  if (kind === 'rank' && channelId) setSetting('timeclock_rank_channel_id', channelId);
  return getMessage(kind);
}

module.exports = {
  purgeOldSessions,
  getOpenSession,
  listOpenSessions,
  startSession,
  stopSession,
  getUserTotals,
  getWeeklyRank,
  getWeeklyRankForStart,
  getMessage,
  setMessage,
};
