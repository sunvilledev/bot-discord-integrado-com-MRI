const { EmbedBuilder } = require('discord.js');
const store = require('../store');
const db = require('../db');
const game = require('../game');
const { guildId, colors } = require('../config');

const POLL_MS = 5000;
const RECENT_MINUTES = 20;

let timer = null;
let running = false;
let schema = null;

function settings() {
  return store.load().rename || {};
}

function parseDiscord(raw) {
  const match = String(raw || '').match(/(\d{15,22})/);
  return match ? match[1] : null;
}

function firstNameOf(charinfo) {
  if (!charinfo) return '';
  let data = charinfo;
  if (typeof charinfo === 'string') {
    try { data = JSON.parse(charinfo); } catch { return ''; }
  }
  if (!data || typeof data !== 'object') return '';
  return String(data.firstname || data.firstName || data.FirstName || '').replace(/[\r\n|]/g, '').trim();
}

function buildNick(firstName, citizenid) {
  const id = String(citizenid || '').replace(/^#/, '').trim();
  const first = String(firstName || '').replace(/[\r\n|]/g, '').trim();
  if (!first || !id) return null;
  const suffix = ` | #${id}`;
  const maxFirst = Math.max(1, 32 - suffix.length);
  return `${first.slice(0, maxFirst)}${suffix}`.slice(0, 32);
}

function licenseKey(value) {
  return String(value || '').trim().replace(/^license2?:/i, '').toLowerCase();
}

async function columnsOf(table) {
  try {
    const rows = await game.query(`SHOW COLUMNS FROM \`${table}\``);
    return new Set(rows.map((row) => String(row.Field || row.field || '')));
  } catch {
    return new Set();
  }
}

async function loadSchema() {
  if (schema) return schema;
  const players = await columnsOf('players');
  const users = await columnsOf('users');
  if (!players.has('citizenid')) {
    throw new Error('Tabela players sem citizenid');
  }
  schema = { players, users };
  return schema;
}

async function seedExisting() {
  if (db.getRenameState('seeded') === '1') return;
  const { players } = await loadSchema();
  if (players.has('id')) {
    const rows = await game.query('SELECT MAX(id) AS maxId FROM players');
    db.setRenameState('last_id', String(rows[0]?.maxId || 0));
  }
  const ids = await game.query('SELECT citizenid FROM players');
  db.markRenameMany(ids.map((row) => row.citizenid).filter(Boolean));
  db.setRenameState('seeded', '1');
  console.log(`[rename] ${ids.length} personagens atuais marcados; só os novos vão alterar o Discord`);
}

function playerSelectSql({ players, users }, { all = false } = {}) {
  const select = ['p.citizenid', 'p.charinfo', 'p.license AS player_license'];
  if (players.has('id')) select.push('p.id AS player_id');
  if (players.has('discord')) select.push('p.discord AS player_discord');
  if (players.has('userId')) select.push('p.userId AS player_user_id');
  if (users.has('discord')) select.push('u.discord AS user_discord');

  let sql = `SELECT ${select.join(', ')} FROM players p`;
  if (users.has('discord')) {
    const joins = [];
    if (users.has('license') && players.has('license')) {
      joins.push(`REPLACE(REPLACE(IFNULL(u.license,''), 'license2:', ''), 'license:', '') = REPLACE(REPLACE(IFNULL(p.license,''), 'license2:', ''), 'license:', '')`);
    }
    if (users.has('license2') && players.has('license')) {
      joins.push(`REPLACE(REPLACE(IFNULL(u.license2,''), 'license2:', ''), 'license:', '') = REPLACE(REPLACE(IFNULL(p.license,''), 'license2:', ''), 'license:', '')`);
    }
    if (users.has('userId') && players.has('userId')) {
      joins.push('u.userId = p.userId');
    }
    if (joins.length) sql += ` LEFT JOIN users u ON (${joins.join(' OR ')})`;
  }

  if (all) {
    if (players.has('id')) sql += ' ORDER BY p.id DESC';
    return sql;
  }

  const where = [];
  if (players.has('id')) where.push('p.id > ?');
  if (players.has('last_updated')) where.push(`p.last_updated >= DATE_SUB(NOW(), INTERVAL ${RECENT_MINUTES} MINUTE)`);
  if (where.length) sql += ` WHERE ${where.join(' OR ')}`;
  sql += players.has('id') ? ' ORDER BY p.id ASC LIMIT 80' : ' LIMIT 80';
  return sql;
}

async function fetchCandidates({ all = false } = {}) {
  const info = await loadSchema();
  const sql = playerSelectSql(info, { all });
  const params = [];
  if (!all && info.players.has('id')) {
    params.push(Number(db.getRenameState('last_id', '0')) || 0);
  }
  return game.query(sql, params);
}

async function resolveDiscord(row) {
  const direct = parseDiscord(row.user_discord) || parseDiscord(row.player_discord);
  if (direct) return direct;

  const key = licenseKey(row.player_license);
  if (!key) return null;
  const variants = [key, `license:${key}`, `license2:${key}`];
  const ph = variants.map(() => '?').join(',');
  const rows = await game.query(
    `SELECT discord FROM users
     WHERE license IN (${ph}) OR license2 IN (${ph})
     LIMIT 1`,
    [...variants, ...variants],
  );
  return parseDiscord(rows[0]?.discord);
}

function shouldSkip(member) {
  const roles = settings().skipRoles || [];
  return roles.some((id) => member.roles.cache.has(id));
}

async function applyNick(client, row, { force = false } = {}) {
  const citizenid = String(row.citizenid || '').trim();
  if (!citizenid) return { status: 'skip' };
  if (!force && db.isRenameDone(citizenid)) return { status: 'done' };

  const first = firstNameOf(row.charinfo);
  const nick = buildNick(first, citizenid);
  if (!nick) return { status: 'wait' };

  const discordId = await resolveDiscord(row);
  if (!discordId) return { status: 'wait' };

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { status: 'wait' };
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) {
    db.markRename(citizenid, discordId, null);
    return { status: 'missing' };
  }
  if (shouldSkip(member)) {
    db.markRename(citizenid, discordId, null);
    return { status: 'skip' };
  }
  if (member.nickname === nick || member.displayName === nick) {
    db.markRename(citizenid, discordId, nick);
    return { status: 'done' };
  }
  if (!member.manageable) {
    console.warn(`[rename] sem permissão para alterar ${member.user.tag}`);
    db.markRename(citizenid, discordId, null);
    return { status: 'denied' };
  }

  await member.setNickname(nick, 'Personagem criado na Sunville');
  db.markRename(citizenid, discordId, nick);
  await logRename(client, member, first, citizenid, nick);
  return { status: 'renamed', member, nick };
}

async function logRename(client, member, first, citizenid, nick) {
  const channelId = settings().logChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(colors.gold)
        .setTitle('🪪 Discord atualizado')
        .setDescription(`${member} agora se chama **${nick}**`)
        .addFields(
          { name: 'Personagem', value: first, inline: true },
          { name: 'CitizenID', value: `#${String(citizenid).replace(/^#/, '')}`, inline: true },
        )
        .setTimestamp(),
    ],
  }).catch(() => {});
}

async function tick(client, { all = false } = {}) {
  if (running) return { ok: 0, fail: 0, wait: 0 };
  if (!settings().enabled && !all) return { ok: 0, fail: 0, wait: 0 };
  if (!game.mysqlConfigured()) return { ok: 0, fail: 0, wait: 0 };

  running = true;
  const result = { ok: 0, fail: 0, wait: 0 };
  try {
    await seedExisting();
    const rows = await fetchCandidates({ all });
    let maxId = Number(db.getRenameState('last_id', '0')) || 0;
    const seen = new Set();
    for (const row of rows) {
      if (!row.citizenid || seen.has(row.citizenid)) continue;
      seen.add(row.citizenid);
      if (!all && db.isRenameDone(row.citizenid)) {
        if (row.player_id) maxId = Math.max(maxId, Number(row.player_id) || 0);
        continue;
      }
      try {
        const outcome = await applyNick(client, row, { force: all });
        if (outcome.status === 'renamed') result.ok += 1;
        else if (outcome.status === 'wait') result.wait += 1;
        else if (outcome.status === 'denied') result.fail += 1;
        if (outcome.status !== 'wait' && row.player_id) {
          maxId = Math.max(maxId, Number(row.player_id) || 0);
        }
        if (outcome.status === 'renamed') {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      } catch (err) {
        result.fail += 1;
        console.error('[rename]', row.citizenid, err.message);
      }
    }
    if (!all && maxId) db.setRenameState('last_id', String(maxId));
  } catch (err) {
    console.error('[rename] tick', err.message);
  } finally {
    running = false;
  }
  return result;
}

async function syncAll(client) {
  return tick(client, { all: true });
}

function start(client) {
  if (timer) clearInterval(timer);
  tick(client).catch((err) => console.error('[rename]', err.message));
  timer = setInterval(() => {
    tick(client).catch((err) => console.error('[rename]', err.message));
  }, POLL_MS);
}

module.exports = {
  start,
  tick,
  syncAll,
  buildNick,
  count: () => {
    try { return db.countRenames(); } catch { return 0; }
  },
};
