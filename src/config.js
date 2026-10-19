require('dotenv').config();

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'ADMIN_ROLE_ID'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[config] Variável ${key} não definida no .env`);
    process.exit(1);
  }
}

function loadStore() {
  return require('./store').load();
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID,
  fivem: {
    endpoint: (process.env.FIVEM_ENDPOINT || '').replace(/\/$/, ''),
    cfxCode: (process.env.FIVEM_CFX_CODE || '').trim(),
  },
  mysql: {
    host: process.env.MYSQL_HOST || '',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || '',
  },
  colors: {
    gold: 0xc9a227,
    dark: 0x2b2d31,
    success: 0x2ecc71,
    error: 0xe74c3c,
    info: 0x3498db,
    leave: 0xe67e22,
  },
  brand: {
    name: 'Sunville',
    color: 0xc9a227,
    colorError: 0xe74c3c,
    colorSuccess: 0x2ecc71,
  },
  get discord() {
    const data = loadStore();
    const commands = data.commands || {};
    return {
      token: process.env.DISCORD_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
      guildId: process.env.DISCORD_GUILD_ID,
      staffRoleId: commands.staffRoleId || process.env.STAFF_ROLE_ID || '',
      logChannelId: commands.logChannelId || process.env.LOG_CHANNEL_ID || '',
      banAnnounceChannelId: commands.banLogChannelId || '',
      banRoleId: commands.banRoleId || process.env.BAN_ROLE_ID || '',
      warnRole1Id: commands.warnRole1Id || '',
      warnRole2Id: commands.warnRole2Id || '',
      warnRole3Id: commands.warnRole3Id || '',
      panelChannelId: commands.panelChannelId || process.env.PANEL_CHANNEL_ID || '',
      permissionManagerRoleId: process.env.ADMIN_ROLE_ID,
    };
  },
  get timeclock() {
    const t = loadStore().timeclock || {};
    const weekday = Number(t.resetWeekday);
    const hour = Number(t.resetHour);
    const minute = Number(t.resetMinute);
    const retention = Number(t.retentionDays);
    return {
      channelId: t.channelId || '',
      rankChannelId: t.rankChannelId || '',
      logChannelId: t.logChannelId || '',
      weeklyLogChannelId: t.weeklyLogChannelId || '',
      roleId: t.roleId || '',
      timezone: t.timezone || 'America/Sao_Paulo',
      resetWeekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 6,
      resetHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0,
      resetMinute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 1,
      retentionDays: retention > 0 ? retention : 31,
    };
  },
  hierarchyIntervalMs: 60 * 60 * 1000,
};
