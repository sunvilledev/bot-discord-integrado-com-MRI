const { PermissionFlagsBits } = require('discord.js');
const store = require('../store');
const { adminRoleId } = require('../utils/permissions');

const LINK_RE = /https?:\/\/[^\s<>]+|discord\.gg\/[^\s<>]+|www\.[^\s<>]+/gi;

function hostnameOf(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const withProto = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^discord\.gg\//i, 'discord.gg/')}`;
    if (/^discord\.gg\//i.test(text) || text.toLowerCase().startsWith('discord.gg')) return 'discord.gg';
    return new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return text.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

function extractHosts(content) {
  const matches = String(content || '').match(LINK_RE) || [];
  return [...new Set(matches.map(hostnameOf).filter(Boolean))];
}

function isAllowedHost(host, allowed) {
  return allowed.some((domain) => {
    const clean = String(domain || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
    if (!clean) return false;
    return host === clean || host.endsWith(`.${clean}`);
  });
}

function canBypass(message) {
  const member = message.member;
  if (!member) return false;
  if (message.author?.bot) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  if (member.roles.cache.has(adminRoleId)) return true;
  const cfg = store.load().antilink || {};
  if ((cfg.allowedRoles || []).some((id) => member.roles.cache.has(id))) return true;
  if ((cfg.allowedChannels || []).includes(message.channelId)) return true;
  return false;
}

async function onMessage(message) {
  if (!message.guild || message.author?.bot) return;
  const cfg = store.load().antilink || {};
  if (!cfg.enabled) return;
  if (canBypass(message)) return;
  const interviews = store.load().passlist?.interviews || {};
  if (Object.values(interviews).some((item) => item.channelId === message.channelId)) return;

  const hosts = extractHosts(message.content);
  if (!hosts.length) return;

  const allowed = cfg.allowedDomains || [];
  const blocked = hosts.filter((host) => !isAllowedHost(host, allowed));
  if (!blocked.length) return;

  await message.delete().catch(() => {});
  const { fromTemplate } = require('../utils/embeds');
  const warn = await message.channel.send({
    embeds: [fromTemplate(cfg.warnEmbed || store.load().antilink.warnEmbed, {
      user: `${message.author}`,
    })],
  }).catch(() => null);
  if (warn) {
    setTimeout(() => warn.delete().catch(() => {}), 6000);
  }
}

module.exports = {
  onMessage,
  extractHosts,
};
