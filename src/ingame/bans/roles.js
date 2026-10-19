const { guildId } = require('../../config');
const { db } = require('../../db');
const store = require('../../store');

const PERMANENT = 2147483647;
const CHECK_MS = 30000;

let clientRef = null;
let timer = null;

function roleSettings() {
  const commands = store.load().commands || {};
  return {
    banRoleId: commands.banRoleId || '',
    warnRole1Id: commands.warnRole1Id || '',
    warnRole2Id: commands.warnRole2Id || '',
    warnRole3Id: commands.warnRole3Id || '',
  };
}

function parseDiscordId(identifier) {
  const id = String(identifier || '').replace(/^discord:/i, '').trim();
  return /^\d{15,22}$/.test(id) ? id : '';
}

function saveBan(announce) {
  const discordId = parseDiscordId(announce.discord);
  const expire = Number(announce.expire) || PERMANENT;
  db.prepare(`
    INSERT INTO discord_bans
      (discord_id, name, citizenid, license, license2, reason, expire, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    discordId,
    announce.name || '',
    announce.citizenid || '',
    announce.license || '',
    announce.license2 || '',
    announce.reason || '',
    expire,
    Math.floor(Date.now() / 1000),
  );
  return discordId;
}

function findBans(announce) {
  const discordId = parseDiscordId(announce?.discord);
  return db.prepare(`
    SELECT id, discord_id AS discordId, name, citizenid, license, license2, expire
    FROM discord_bans
    WHERE (? <> '' AND discord_id = ?)
       OR (? <> '' AND citizenid = ?)
       OR (? <> '' AND license = ?)
       OR (? <> '' AND license2 = ?)
  `).all(
    discordId, discordId,
    announce.citizenid || '', announce.citizenid || '',
    announce.license || '', announce.license || '',
    announce.license2 || '', announce.license2 || '',
  );
}

function deleteBanRows(rows) {
  const remove = db.prepare('DELETE FROM discord_bans WHERE id = ?');
  for (const row of rows) {
    remove.run(row.id);
  }
}

function listExpiredBans(now = Math.floor(Date.now() / 1000)) {
  return db.prepare(`
    SELECT id, discord_id AS discordId, name, citizenid, expire
    FROM discord_bans
    WHERE expire > 0 AND expire < ? AND expire < ?
  `).all(now, PERMANENT);
}

async function getGuild(client = clientRef) {
  if (!client) return null;
  return client.guilds.fetch(guildId).catch(() => null);
}

async function setMemberRole(discordId, roleId, shouldHave, reason) {
  if (!roleId || !discordId) return false;
  const guild = await getGuild();
  if (!guild) return false;
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return false;
  const hasRole = member.roles.cache.has(roleId);
  try {
    if (shouldHave && !hasRole) {
      await member.roles.add(roleId, reason);
      return true;
    }
    if (!shouldHave && hasRole) {
      await member.roles.remove(roleId, reason);
      return true;
    }
  } catch (error) {
    console.error(`Cargo Discord: falha em ${discordId}: ${error.message}`);
  }
  return false;
}

async function setBannedRole(discordId, shouldHave) {
  return setMemberRole(discordId, roleSettings().banRoleId, shouldHave, shouldHave ? 'Banimento Sunville' : 'Desbanimento Sunville');
}

async function applyBanRole(announce) {
  const discordId = saveBan(announce);
  if (!roleSettings().banRoleId) return discordId;
  if (!discordId) return '';
  await setBannedRole(discordId, true);
  return discordId;
}

async function removeBanRole(announce) {
  const rows = findBans(announce || {});
  const ids = new Set(rows.map((row) => row.discordId).filter(Boolean));
  const fromAnnounce = parseDiscordId(announce?.discord);
  if (fromAnnounce) ids.add(fromAnnounce);
  for (const discordId of ids) {
    await setBannedRole(discordId, false);
  }
  deleteBanRows(rows);
}

async function sweepExpiredBans(client = clientRef) {
  const expired = listExpiredBans();
  if (!expired.length) return 0;
  for (const row of expired) {
    if (row.discordId) await setBannedRole(row.discordId, false);
    db.prepare('DELETE FROM discord_bans WHERE id = ?').run(row.id);
  }
  return expired.length;
}

async function restoreBanRoleOnJoin(member) {
  if (!roleSettings().banRoleId) return;
  const row = db.prepare(`
    SELECT expire FROM discord_bans
    WHERE discord_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(member.id);
  if (!row) return;
  const now = Math.floor(Date.now() / 1000);
  if (row.expire > 0 && row.expire < PERMANENT && row.expire <= now) {
    db.prepare('DELETE FROM discord_bans WHERE discord_id = ?').run(member.id);
    return;
  }
  await setBannedRole(member.id, true);
}

function warnRoleIds() {
  const cfg = roleSettings();
  return [cfg.warnRole1Id, cfg.warnRole2Id, cfg.warnRole3Id];
}

function findWarningState(announce = {}) {
  const discordId = parseDiscordId(announce.discord);
  return db.prepare(`
    SELECT id, discord_id AS discordId, citizenid, license, license2, name, level
    FROM warning_state
    WHERE (? <> '' AND discord_id = ?)
       OR (? <> '' AND citizenid = ?)
       OR (? <> '' AND license = ?)
       OR (? <> '' AND license2 = ?)
    ORDER BY level DESC
    LIMIT 1
  `).get(
    discordId, discordId,
    announce.citizenid || '', announce.citizenid || '',
    announce.license || '', announce.license || '',
    announce.license2 || '', announce.license2 || '',
  ) || null;
}

function writeWarningHistory(announce, level, action) {
  db.prepare(`
    INSERT INTO warning_history
      (discord_id, citizenid, name, reason, level, action, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseDiscordId(announce.discord),
    announce.citizenid || '',
    announce.name || '',
    announce.reason || '',
    level,
    action,
    Math.floor(Date.now() / 1000),
  );
}

function saveWarningState(announce, level) {
  const existing = findWarningState(announce);
  const discordId = parseDiscordId(announce.discord) || existing?.discordId || '';
  const now = Math.floor(Date.now() / 1000);
  if (existing) {
    db.prepare(`
      UPDATE warning_state
      SET discord_id = ?, citizenid = ?, license = ?, license2 = ?, name = ?, level = ?, last_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(
      discordId || existing.discordId || '',
      announce.citizenid || existing.citizenid || '',
      announce.license || existing.license || '',
      announce.license2 || existing.license2 || '',
      announce.name || existing.name || '',
      level,
      announce.reason || existing.last_reason || '',
      now,
      existing.id,
    );
    return;
  }
  db.prepare(`
    INSERT INTO warning_state
      (discord_id, citizenid, license, license2, name, level, last_reason, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    discordId,
    announce.citizenid || '',
    announce.license || '',
    announce.license2 || '',
    announce.name || '',
    level,
    announce.reason || '',
    now,
  );
}

async function syncWarnRoles(discordId, level) {
  if (!discordId) return;
  const roles = warnRoleIds();
  for (let index = 0; index < roles.length; index += 1) {
    const roleId = roles[index];
    if (!roleId) continue;
    await setMemberRole(discordId, roleId, level === index + 1, 'Advertência Sunville');
  }
}

async function applyWarnRole(announce) {
  const current = findWarningState(announce);
  const previousLevel = current?.level || 0;
  const level = previousLevel >= 3 ? 3 : previousLevel + 1;
  announce.previousLevel = previousLevel;
  announce.level = level;
  announce.maxed = previousLevel >= 3;
  saveWarningState(announce, level);
  writeWarningHistory(announce, level, announce.maxed ? 'max' : 'add');
  const discordId = parseDiscordId(announce.discord) || current?.discordId || '';
  if (discordId) await syncWarnRoles(discordId, level);
  return announce;
}

async function removeWarnRole(announce) {
  const current = findWarningState(announce);
  const previousLevel = current?.level || 0;
  const level = Math.max(0, previousLevel - 1);
  announce.previousLevel = previousLevel;
  announce.level = level;
  announce.none = previousLevel <= 0;
  const discordId = parseDiscordId(announce.discord) || current?.discordId || '';
  if (current && level > 0) saveWarningState(announce, level);
  else if (current) db.prepare('DELETE FROM warning_state WHERE id = ?').run(current.id);
  writeWarningHistory(announce, level, 'remove');
  if (discordId) await syncWarnRoles(discordId, level);
  return announce;
}

async function restoreWarnRoleOnJoin(member) {
  const row = db.prepare(`
    SELECT level FROM warning_state
    WHERE discord_id = ?
    ORDER BY level DESC
    LIMIT 1
  `).get(member.id);
  if (!row?.level) return;
  await syncWarnRoles(member.id, row.level);
}

function startBanRoleWatch(client) {
  clientRef = client;
  if (timer) clearInterval(timer);
  sweepExpiredBans(client).catch(() => {});
  timer = setInterval(() => {
    sweepExpiredBans(client).catch((error) => {
      console.error('[ban-role]', error.message);
    });
  }, CHECK_MS);
}

module.exports = {
  parseDiscordId,
  applyBanRole,
  removeBanRole,
  applyWarnRole,
  removeWarnRole,
  restoreBanRoleOnJoin,
  restoreWarnRoleOnJoin,
  startBanRoleWatch,
};
