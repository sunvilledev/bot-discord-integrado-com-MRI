const mysql = require('mysql2/promise');
const { EmbedBuilder } = require('discord.js');
const { fivem, mysql: mysqlCfg, colors } = require('./config');

let pool = null;

function mysqlConfigured() {
  return Boolean(mysqlCfg.host && mysqlCfg.user && mysqlCfg.database);
}

function fivemConfigured() {
  return Boolean(fivem.endpoint || fivem.cfxCode);
}

function getPool() {
  if (!mysqlConfigured()) return null;
  if (!pool) {
    pool = mysql.createPool({
      host: mysqlCfg.host,
      port: mysqlCfg.port,
      user: mysqlCfg.user,
      password: mysqlCfg.password,
      database: mysqlCfg.database,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 8000,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const db = getPool();
  if (!db) throw new Error('MySQL do servidor não configurado no .env');
  const [rows] = await db.query(sql, params);
  return rows;
}

async function testMysql() {
  if (!mysqlConfigured()) {
    return { ok: false, detail: 'Preencha MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD e MYSQL_DATABASE no .env' };
  }
  try {
    const db = getPool();
    const conn = await db.getConnection();
    try {
      const [info] = await conn.query('SELECT DATABASE() AS db, VERSION() AS version');
      let players = null;
      try {
        const [count] = await conn.query('SELECT COUNT(*) AS total FROM players');
        players = count[0]?.total ?? 0;
      } catch {
        players = null;
      }
      return {
        ok: true,
        database: info[0]?.db || mysqlCfg.database,
        version: String(info[0]?.version || '').split('-')[0],
        host: mysqlCfg.host,
        players,
      };
    } finally {
      conn.release();
    }
  } catch (err) {
    return { ok: false, detail: err.message.replace(mysqlCfg.password, '***') };
  }
}

async function fetchJson(url, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'SunvilleBot/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function testFiveM() {
  if (!fivemConfigured()) {
    return { ok: false, detail: 'Preencha FIVEM_ENDPOINT (ex: http://IP:30120) ou FIVEM_CFX_CODE no .env' };
  }

  if (fivem.cfxCode) {
    try {
      const payload = await fetchJson(`https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(fivem.cfxCode)}`);
      const data = payload?.Data || payload;
      const clients = data?.clients ?? data?.selfReportedClients;
      const max = data?.svMaxclients || data?.sv_maxclients;
      return {
        ok: true,
        via: 'cfx.re',
        hostname: data?.hostname || data?.vars?.sv_projectName || 'FiveM',
        players: clients ?? 0,
        max: max ?? '?',
        code: fivem.cfxCode,
      };
    } catch (err) {
      return { ok: false, detail: `cfx.re: ${err.name === 'AbortError' ? 'tempo esgotado' : err.message}` };
    }
  }

  try {
    const base = fivem.endpoint;
    const info = await fetchJson(`${base}/info.json`);
    let players = [];
    try {
      players = await fetchJson(`${base}/players.json`);
    } catch {
      players = [];
    }
    const vars = info?.vars || {};
    return {
      ok: true,
      via: 'endpoint',
      hostname: vars.sv_projectName || vars.sv_hostname || info?.server || 'FiveM',
      players: Array.isArray(players) ? players.length : 0,
      max: vars.sv_maxclients || info?.vars?.sv_maxClients || '?',
      endpoint: base,
    };
  } catch (err) {
    return { ok: false, detail: `servidor: ${err.name === 'AbortError' ? 'tempo esgotado' : err.message}` };
  }
}

function statusEmbed(fivemStatus, dbStatus) {
  const fivemText = fivemStatus.ok
    ? `✅ **Online**\n` +
      `${fivemStatus.hostname}\n` +
      `Jogadores: **${fivemStatus.players}/${fivemStatus.max}**\n` +
      (fivemStatus.code ? `Código: \`${fivemStatus.code}\`` : `Endpoint: \`${fivemStatus.endpoint}\``)
    : `❌ **Offline / não configurado**\n${fivemStatus.detail}`;

  const dbText = dbStatus.ok
    ? `✅ **Conectado**\n` +
      `Host: \`${dbStatus.host}\`\n` +
      `Database: \`${dbStatus.database}\`\n` +
      `MySQL ${dbStatus.version}` +
      (dbStatus.players != null ? `\nPersonagens (players): **${dbStatus.players}**` : '')
    : `❌ **Sem conexão**\n${dbStatus.detail}`;

  const allOk = fivemStatus.ok && dbStatus.ok;
  return new EmbedBuilder()
    .setColor(allOk ? colors.success : colors.error)
    .setTitle(allOk ? 'Conexões OK — Sunville' : 'Falha em uma das conexões')
    .addFields(
      { name: '🎮 Servidor FiveM', value: fivemText.slice(0, 1024), inline: false },
      { name: '🗄️ Banco MRI (MySQL)', value: dbText.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Credenciais ficam no .env • MRI QBCore' })
    .setTimestamp();
}

async function testBoth() {
  const [server, database] = await Promise.all([testFiveM(), testMysql()]);
  return { server, database, embed: statusEmbed(server, database) };
}

async function handleCommand(interaction) {
  const { denyIfNotAdmin } = require('./utils/permissions');
  if (await denyIfNotAdmin(interaction)) return;
  await interaction.deferReply({ ephemeral: true });
  const { embed } = await testBoth();
  await interaction.editReply({ embeds: [embed] });
}

async function initMysql() {
  if (!mysqlConfigured()) {
    console.log('[mysql] Servidor FiveM: MySQL não configurado no .env');
    return false;
  }
  const result = await testMysql();
  if (result.ok) {
    console.log(`[mysql] Conectado em ${result.database} (${result.host})`);
    try {
      await require('./systems/passlist').ensureTables();
      console.log('[mysql] Tabelas da passlist prontas');
    } catch (err) {
      console.error('[mysql] Passlist:', err.message);
    }
    return true;
  }
  console.error('[mysql] Falha:', result.detail);
  return false;
}

module.exports = {
  getPool,
  query,
  testMysql,
  testFiveM,
  testBoth,
  handleCommand,
  initMysql,
  mysqlConfigured,
  fivemConfigured,
};
