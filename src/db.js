const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const filePath = path.join(__dirname, '..', 'data', 'sunville.db');

let SQL = null;
let db = null;

function expireAt(from = Date.now()) {
  return from + RETENTION_MS;
}

function persist() {
  if (!db) return;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const bytes = db.export();
  fs.writeFileSync(filePath, Buffer.from(bytes));
}

function exec(sql) {
  db.exec(sql);
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

function purge() {
  if (!db) return;
  const now = Date.now();
  run('DELETE FROM tickets WHERE expires_at < ?', [now]);
  run('DELETE FROM archive WHERE expires_at < ?', [now]);
  run('DELETE FROM ticket_claims WHERE expires_at < ?', [now]);
  run('DELETE FROM ticket_ratings WHERE expires_at < ?', [now]);
}

async function init() {
  if (db) return db;
  SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file),
  });
  if (fs.existsSync(filePath)) {
    db = new SQL.Database(fs.readFileSync(filePath));
  } else {
    db = new SQL.Database();
  }

  exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER,
      guild_id TEXT,
      channel_id TEXT,
      user_id TEXT,
      user_tag TEXT,
      category_id TEXT,
      category_label TEXT,
      opened_at INTEGER,
      closed_at INTEGER,
      closed_by TEXT,
      closed_by_tag TEXT,
      transcript TEXT,
      message_count INTEGER DEFAULT 0,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      user_id TEXT,
      payload TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      role_id TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      PRIMARY KEY (role_id, action_id)
    );

    CREATE TABLE IF NOT EXISTS timeclock_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS timeclock_messages (
      kind TEXT PRIMARY KEY,
      channel_id TEXT,
      message_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_timeclock_user ON timeclock_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_timeclock_open ON timeclock_sessions(user_id, ended_at);
    CREATE INDEX IF NOT EXISTS idx_timeclock_started ON timeclock_sessions(started_at);

    CREATE TABLE IF NOT EXISTS ticket_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      ticket_channel_id TEXT,
      ticket_number INTEGER,
      claimed_at INTEGER NOT NULL,
      week_start INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number INTEGER,
      opener_id TEXT,
      staff_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_claims_week ON ticket_claims(week_start);
    CREATE INDEX IF NOT EXISTS idx_claims_user ON ticket_claims(user_id);
    CREATE INDEX IF NOT EXISTS idx_ratings_ticket ON ticket_ratings(ticket_number, opener_id);

    CREATE TABLE IF NOT EXISTS discord_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT,
      name TEXT,
      citizenid TEXT,
      license TEXT,
      license2 TEXT,
      reason TEXT,
      expire INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_discord_bans_discord ON discord_bans(discord_id);
    CREATE INDEX IF NOT EXISTS idx_discord_bans_expire ON discord_bans(expire);

    CREATE TABLE IF NOT EXISTS warning_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT,
      citizenid TEXT,
      license TEXT,
      license2 TEXT,
      name TEXT,
      level INTEGER NOT NULL,
      last_reason TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warning_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT,
      citizenid TEXT,
      name TEXT,
      reason TEXT,
      level INTEGER NOT NULL,
      action TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rename_applied (
      citizenid TEXT PRIMARY KEY,
      discord_id TEXT,
      nickname TEXT,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rename_state (
      k TEXT PRIMARY KEY,
      v TEXT
    );
  `);
  persist();
  purge();
  return db;
}

function ensureReady() {
  if (!db) throw new Error('Banco local ainda não iniciado');
}

function lastInsertRowid() {
  const res = db.exec('SELECT last_insert_rowid() AS id');
  return res[0]?.values?.[0]?.[0];
}

function prepare(sql) {
  return {
    get(...params) {
      ensureReady();
      const stmt = db.prepare(sql);
      try {
        if (params.length) stmt.bind(params);
        if (!stmt.step()) return undefined;
        return stmt.getAsObject();
      } finally {
        stmt.free();
      }
    },
    all(...params) {
      ensureReady();
      const stmt = db.prepare(sql);
      try {
        if (params.length) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    run(...params) {
      ensureReady();
      db.run(sql, params);
      persist();
      return { lastInsertRowid: lastInsertRowid() };
    },
  };
}

const dbApi = {
  prepare,
  exec(sql) {
    ensureReady();
    db.exec(sql);
  },
};

const SETTING_PATHS = {
  staff_role_id: ['commands', 'staffRoleId'],
  log_channel_id: ['commands', 'logChannelId'],
  panel_channel_id: ['commands', 'panelChannelId'],
  fivem_url: ['commands', 'fivemUrl'],
  fivem_resource: ['commands', 'fivemResource'],
  fivem_token: ['commands', 'fivemToken'],
  timeclock_channel_id: ['timeclock', 'channelId'],
  timeclock_rank_channel_id: ['timeclock', 'rankChannelId'],
  timeclock_role_id: ['timeclock', 'roleId'],
  timeclock_timezone: ['timeclock', 'timezone'],
  timeclock_reset_weekday: ['timeclock', 'resetWeekday'],
  timeclock_reset_hour: ['timeclock', 'resetHour'],
  timeclock_reset_minute: ['timeclock', 'resetMinute'],
  timeclock_retention_days: ['timeclock', 'retentionDays'],
  timeclock_log_channel_id: ['timeclock', 'logChannelId'],
  timeclock_weekly_log_channel_id: ['timeclock', 'weeklyLogChannelId'],
};

const NUMERIC_SETTINGS = new Set([
  'timeclock_reset_weekday',
  'timeclock_reset_hour',
  'timeclock_reset_minute',
  'timeclock_retention_days',
]);

function getSetting(key, fallback = '') {
  const pathKeys = SETTING_PATHS[key];
  if (!pathKeys) return fallback;
  const data = require('./store').load();
  const value = data[pathKeys[0]]?.[pathKeys[1]];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function setSetting(key, value) {
  const pathKeys = SETTING_PATHS[key];
  if (!pathKeys) return fallbackEmpty(value);
  require('./store').update((s) => {
    if (!s[pathKeys[0]]) s[pathKeys[0]] = {};
    if (value == null || value === '') {
      s[pathKeys[0]][pathKeys[1]] = NUMERIC_SETTINGS.has(key) ? 0 : '';
      return;
    }
    s[pathKeys[0]][pathKeys[1]] = NUMERIC_SETTINGS.has(key) ? Number(value) : String(value);
  });
  return getSetting(key);
}

function fallbackEmpty(value) {
  return value == null ? '' : String(value);
}

function getPanel() {
  const commands = require('./store').load().commands || {};
  return {
    channelId: commands.panelChannelId || '',
    messageId: commands.panelMessageId || '',
  };
}

function setPanel({ channelId, messageId }) {
  require('./store').update((s) => {
    if (channelId !== undefined) s.commands.panelChannelId = channelId || null;
    if (messageId !== undefined) s.commands.panelMessageId = messageId || null;
  });
  if (channelId) setSetting('panel_channel_id', channelId);
  return getPanel();
}

function runTransaction(fn) {
  ensureReady();
  db.run('BEGIN');
  try {
    fn();
    db.run('COMMIT');
    persist();
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function getRoleActions(roleId) {
  return prepare('SELECT action_id FROM role_permissions WHERE role_id = ?')
    .all(roleId)
    .map((row) => row.action_id);
}

function listConfiguredRoles() {
  const fromRoles = prepare('SELECT role_id FROM roles').all().map((row) => row.role_id);
  if (fromRoles.length) return fromRoles;
  return prepare('SELECT DISTINCT role_id FROM role_permissions').all().map((row) => row.role_id);
}

function setRoleActions(roleId, actionIds) {
  runTransaction(() => {
    db.run('INSERT OR IGNORE INTO roles (role_id) VALUES (?)', [roleId]);
    db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    for (const actionId of new Set(actionIds)) {
      if (actionId) db.run('INSERT INTO role_permissions (role_id, action_id) VALUES (?, ?)', [roleId, actionId]);
    }
  });
  return getRoleActions(roleId);
}

function mergeRoleActions(roleId, categoryActionIds, categoryAllIds) {
  const current = getRoleActions(roleId).filter((id) => !categoryAllIds.includes(id));
  return setRoleActions(roleId, [...current, ...categoryActionIds]);
}

function removeRole(roleId) {
  prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
  prepare('DELETE FROM roles WHERE role_id = ?').run(roleId);
}

function getMemberActionIds(member) {
  if (!member?.roles?.cache) return [];
  const allowed = new Set();
  for (const memberRoleId of member.roles.cache.keys()) {
    for (const actionId of getRoleActions(memberRoleId)) {
      allowed.add(actionId);
    }
  }
  return [...allowed];
}

function insertTicketOpen({ number, guildId, channelId, userId, userTag, categoryId, categoryLabel }) {
  const now = Date.now();
  run(
    `INSERT INTO tickets (number, guild_id, channel_id, user_id, user_tag, category_id, category_label, opened_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [number, guildId, channelId, userId, userTag, categoryId, categoryLabel, now, expireAt(now)],
  );
}

function closeTicketRecord({ channelId, closedBy, closedByTag, transcript, messageCount }) {
  const now = Date.now();
  run(
    `UPDATE tickets
     SET closed_at = ?, closed_by = ?, closed_by_tag = ?, transcript = ?, message_count = ?, expires_at = ?
     WHERE channel_id = ? AND closed_at IS NULL`,
    [now, closedBy, closedByTag, transcript, messageCount, expireAt(now), channelId],
  );
}

function insertTicketClaim({ userId, ticketChannelId, ticketNumber, weekStart }) {
  const now = Date.now();
  const existing = prepare(`
    SELECT id FROM ticket_claims
    WHERE ticket_channel_id = ?
    LIMIT 1
  `).get(String(ticketChannelId));
  if (existing) return false;
  run(
    `INSERT INTO ticket_claims (user_id, ticket_channel_id, ticket_number, claimed_at, week_start, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [String(userId), String(ticketChannelId || ''), ticketNumber || null, now, weekStart, expireAt(now)],
  );
  return true;
}

function getClaimByChannel(channelId) {
  const row = prepare(`
    SELECT user_id AS userId
    FROM ticket_claims
    WHERE ticket_channel_id = ?
    ORDER BY claimed_at DESC
    LIMIT 1
  `).get(String(channelId));
  return row?.userId ? String(row.userId) : null;
}

function getTicketClaimRank(weekStart) {
  return prepare(`
    SELECT user_id AS userId, COUNT(*) AS total
    FROM ticket_claims
    WHERE week_start = ?
    GROUP BY user_id
    ORDER BY total DESC
  `).all(weekStart).map((row) => ({
    userId: String(row.userId),
    total: Number(row.total) || 0,
  }));
}

function hasTicketRating(ticketNumber, openerId) {
  const row = prepare(`
    SELECT id FROM ticket_ratings
    WHERE ticket_number = ? AND opener_id = ?
    LIMIT 1
  `).get(ticketNumber, String(openerId));
  return Boolean(row);
}

function insertTicketRating({ ticketNumber, openerId, staffId, score }) {
  if (hasTicketRating(ticketNumber, openerId)) return false;
  const now = Date.now();
  run(
    `INSERT INTO ticket_ratings (ticket_number, opener_id, staff_id, score, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ticketNumber, String(openerId), String(staffId), Number(score), now, expireAt(now)],
  );
  return true;
}

function insertArchive(type, userId, payload) {
  const now = Date.now();
  run(
    'INSERT INTO archive (type, user_id, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    [type, userId || null, JSON.stringify(payload || {}), now, expireAt(now)],
  );
}

function isRenameDone(citizenid) {
  const row = prepare('SELECT citizenid FROM rename_applied WHERE citizenid = ?').get(String(citizenid));
  return Boolean(row);
}

function markRename(citizenid, discordId, nickname) {
  prepare(`
    INSERT OR REPLACE INTO rename_applied (citizenid, discord_id, nickname, applied_at)
    VALUES (?, ?, ?, ?)
  `).run(String(citizenid), discordId || null, nickname || null, Date.now());
}

function markRenameMany(citizenids) {
  const now = Date.now();
  runTransaction(() => {
    for (const id of citizenids) {
      if (!id) continue;
      db.run(
        'INSERT OR IGNORE INTO rename_applied (citizenid, discord_id, nickname, applied_at) VALUES (?, NULL, NULL, ?)',
        [String(id), now],
      );
    }
  });
}

function getRenameState(key, fallback = '') {
  const row = prepare('SELECT v FROM rename_state WHERE k = ?').get(String(key));
  return row?.v == null ? fallback : String(row.v);
}

function setRenameState(key, value) {
  prepare('INSERT OR REPLACE INTO rename_state (k, v) VALUES (?, ?)').run(String(key), String(value));
}

function countRenames() {
  const row = prepare('SELECT COUNT(*) AS total FROM rename_applied WHERE nickname IS NOT NULL AND nickname != \'\'').get();
  return Number(row?.total) || 0;
}

function startPurgeInterval() {
  setInterval(() => {
    try { purge(); } catch (err) { console.error('[db] purge', err.message); }
  }, 6 * 60 * 60 * 1000);
}

module.exports = {
  db: dbApi,
  init,
  purge,
  insertTicketOpen,
  closeTicketRecord,
  insertTicketClaim,
  getClaimByChannel,
  getTicketClaimRank,
  hasTicketRating,
  insertTicketRating,
  insertArchive,
  isRenameDone,
  markRename,
  markRenameMany,
  getRenameState,
  setRenameState,
  countRenames,
  startPurgeInterval,
  RETENTION_MS,
  getSetting,
  setSetting,
  getPanel,
  setPanel,
  getRoleActions,
  listConfiguredRoles,
  setRoleActions,
  mergeRoleActions,
  removeRole,
  getMemberActionIds,
};
