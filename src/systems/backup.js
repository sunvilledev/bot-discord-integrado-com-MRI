const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { AttachmentBuilder } = require('discord.js');
const store = require('../store');
const { mysql: mysqlCfg, colors } = require('../config');
const { fromTemplate, success, error } = require('../utils/embeds');
const game = require('../game');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups');
const DISCORD_CHUNK = 8 * 1024 * 1024;
const CHECK_MS = 5 * 60 * 1000;

let timer = null;
let running = false;

function settings() {
  return store.load().backup || {};
}

function intervalMs() {
  const hours = Number(settings().intervalHours);
  return (Number.isFinite(hours) && hours > 0 ? hours : 8) * 60 * 60 * 1000;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function rotateLocal() {
  const keep = Number(settings().keepLocal) || 7;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.sql.gz'))
    .map((name) => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const file of files.slice(keep)) {
    fs.unlinkSync(path.join(BACKUP_DIR, file.name));
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    const ok = stream.write(chunk);
    if (ok) resolve();
    else stream.once('drain', resolve);
    stream.once('error', reject);
  });
}

async function dumpWithNode(filePath) {
  const pool = game.getPool();
  if (!pool) throw new Error('MySQL do FiveM não está configurado no .env');
  const conn = await pool.getConnection();
  const gzip = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(filePath);
  gzip.pipe(out);

  const finished = new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    gzip.on('error', reject);
  });

  try {
    const dbName = mysqlCfg.database;
    const [tables] = await conn.query(
      'SHOW FULL TABLES WHERE Table_type = ?',
      ['BASE TABLE'],
    );
    const names = tables.map((row) => row[`Tables_in_${mysqlCfg.database}`] || Object.values(row)[0]);
    await writeChunk(gzip, `-- Sunville backup\n-- Database: ${dbName}\n-- ${new Date().toISOString()}\nSET FOREIGN_KEY_CHECKS=0;\n\n`);

    for (const table of names) {
      const [createRows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      const createSql = createRows[0]['Create Table'] || createRows[0]['Create View'];
      await writeChunk(gzip, `DROP TABLE IF EXISTS \`${table}\`;\n${createSql};\n\n`);

      const batch = 400;
      let offset = 0;
      while (true) {
        const [rows] = await conn.query(`SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`, [batch, offset]);
        if (!rows.length) break;
        const cols = Object.keys(rows[0]).map((col) => `\`${col}\``).join(', ');
        const values = rows.map((row) => `(${Object.values(row).map(sqlLiteral).join(', ')})`).join(',\n');
        await writeChunk(gzip, `INSERT INTO \`${table}\` (${cols}) VALUES\n${values};\n`);
        offset += rows.length;
        if (rows.length < batch) break;
      }
      await writeChunk(gzip, '\n');
    }

    await writeChunk(gzip, 'SET FOREIGN_KEY_CHECKS=1;\n');
    gzip.end();
    await finished;
    return names.length;
  } catch (err) {
    gzip.destroy();
    out.destroy();
    throw err;
  } finally {
    conn.release();
  }
}

function dumpWithMysqlDump(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      `-h${mysqlCfg.host}`,
      `-P${mysqlCfg.port}`,
      `-u${mysqlCfg.user}`,
      '--single-transaction',
      '--quick',
      '--routines',
      '--triggers',
      '--default-character-set=utf8mb4',
      mysqlCfg.database,
    ];
    const child = spawn('mysqldump', args, {
      env: { ...process.env, MYSQL_PWD: mysqlCfg.password || '' },
      windowsHide: true,
    });
    const gzip = zlib.createGzip({ level: 6 });
    const out = fs.createWriteStream(filePath);
    child.stdout.pipe(gzip).pipe(out);
    let stderr = '';
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });
    child.on('error', (err) => reject(err));
    out.on('error', reject);
    out.on('finish', () => {
      if (child.exitCode && child.exitCode !== 0) {
        reject(new Error(stderr.trim() || `mysqldump saiu com código ${child.exitCode}`));
        return;
      }
      resolve(null);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        gzip.destroy();
        reject(new Error(stderr.trim() || `mysqldump saiu com código ${code}`));
      }
    });
  });
}

async function createDump() {
  if (!game.mysqlConfigured()) {
    throw new Error('Preencha MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD e MYSQL_DATABASE no .env');
  }
  ensureDir();
  const fileName = `fivem-${mysqlCfg.database || 'server'}-${stamp()}.sql.gz`;
  const filePath = path.join(BACKUP_DIR, fileName);
  let tables = null;
  try {
    tables = await dumpWithMysqlDump(filePath);
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    tables = await dumpWithNode(filePath);
  }
  rotateLocal();
  const size = fs.statSync(filePath).size;
  let tableCount = tables;
  if (tableCount == null) {
    try {
      const rows = await game.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
      tableCount = rows.length;
    } catch {
      tableCount = null;
    }
  }
  return { filePath, fileName, size, tables: tableCount };
}

async function sendToChannel(client, dump, extra = {}) {
  const channelId = settings().channelId;
  if (!channelId) return { sent: false, reason: 'Canal de backup não definido' };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return { sent: false, reason: 'Canal de backup inválido' };

  const next = Math.floor((Date.now() + intervalMs()) / 1000);
  const embed = fromTemplate(settings().embed || {}, {
    banco: mysqlCfg.database || '—',
    tamanho: formatBytes(dump.size),
    tabelas: dump.tables == null ? '—' : String(dump.tables),
    arquivo: dump.fileName,
    quando: `<t:${Math.floor(Date.now() / 1000)}:F>`,
    proximo: `<t:${next}:R>`,
  }, { timestamp: true });
  if (extra.error) embed.setColor(colors.error);

  const raw = fs.readFileSync(dump.filePath);
  const files = [];
  if (raw.length <= DISCORD_CHUNK) {
    files.push(new AttachmentBuilder(raw, { name: dump.fileName }));
  } else {
    let part = 1;
    for (let i = 0; i < raw.length; i += DISCORD_CHUNK) {
      files.push(new AttachmentBuilder(raw.subarray(i, i + DISCORD_CHUNK), {
        name: `${dump.fileName}.${String(part).padStart(2, '0')}`,
      }));
      part += 1;
    }
  }

  const batchSize = 8;
  for (let i = 0; i < files.length; i += batchSize) {
    const chunk = files.slice(i, i + batchSize);
    await channel.send({
      embeds: i === 0 ? [embed] : [],
      files: chunk,
      content: files.length > 1 && i === 0
        ? `Arquivo grande: ${files.length} partes. Baixe todas e junte na ordem.`
        : undefined,
    });
  }
  return { sent: true };
}

async function runBackup(client, { reason } = {}) {
  if (running) return { ok: false, message: 'Já existe um backup em andamento.' };
  running = true;
  try {
    const dump = await createDump();
    store.update((s) => {
      if (!s.backup) s.backup = {};
      s.backup.lastBackupAt = Date.now();
      s.backup.lastFile = dump.fileName;
      s.backup.lastSize = dump.size;
    });
    const sent = await sendToChannel(client, dump).catch((err) => ({ sent: false, reason: err.message }));
    return {
      ok: true,
      dump,
      sent: Boolean(sent.sent),
      sendError: sent.reason,
      reason,
    };
  } finally {
    running = false;
  }
}

function due() {
  const cfg = settings();
  if (!cfg.enabled) return false;
  const last = Number(cfg.lastBackupAt) || 0;
  return Date.now() - last >= intervalMs();
}

function start(client) {
  if (timer) clearInterval(timer);
  const tick = () => {
    if (!due()) return;
    runBackup(client, { reason: 'agendado' }).catch((err) => {
      console.error('[backup]', err.message);
    });
  };
  timer = setInterval(tick, CHECK_MS);
  setTimeout(tick, 15000);
}

function lastLabel() {
  const at = Number(settings().lastBackupAt) || 0;
  if (!at) return '`nunca`';
  return `<t:${Math.floor(at / 1000)}:R>`;
}

function nextLabel() {
  const at = Number(settings().lastBackupAt) || 0;
  if (!at) return '`no próximo ciclo`';
  return `<t:${Math.floor((at + intervalMs()) / 1000)}:R>`;
}

async function runNow(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const result = await runBackup(interaction.client, { reason: 'manual' });
    if (!result.ok) {
      await interaction.editReply({ embeds: [error(result.message)] });
      return;
    }
    const extra = result.sent
      ? `Enviado em <#${settings().channelId}>.`
      : `Salvo localmente. ${result.sendError || 'Defina o canal no /configurar.'}`;
    await interaction.editReply({
      embeds: [success(
        `Backup **${result.dump.fileName}** pronto (${formatBytes(result.dump.size)}).\n${extra}`,
      )],
    });
  } catch (err) {
    await interaction.editReply({ embeds: [error(`Falha no backup: ${err.message}`)] });
  }
}

module.exports = {
  start,
  runNow,
  runBackup,
  lastLabel,
  nextLabel,
  intervalMs,
  settings,
};
