const store = require('../store');
const db = require('../db');
const { fromTemplate } = require('../utils/embeds');
const { getWeekStart, getWeekEnd, formatDateTime, describeReset } = require('../ingame/timeclock/time');

function rankVars(weekStartMs, lista) {
  const weekEnd = getWeekEnd(weekStartMs);
  return {
    periodo: `${formatDateTime(weekStartMs)} → ${formatDateTime(weekEnd)}`,
    reset: describeReset(),
    lista,
  };
}

function buildRankEmbed(weekStartMs = getWeekStart(), closed = false) {
  const ranking = db.getTicketClaimRank(weekStartMs);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranking.slice(0, 25).map((row, index) => {
    const medal = medals[index] || `**${index + 1}.**`;
    const label = row.total === 1 ? 'ticket' : 'tickets';
    return `${medal} <@${row.userId}> — **${row.total}** ${label}`;
  });
  const lista = lines.length ? lines.join('\n') : 'Nenhum ticket assumido nesta semana.';
  const visual = closed
    ? store.load().tickets.rankClosedEmbed
    : store.load().tickets.rankEmbed;
  return fromTemplate(visual, rankVars(weekStartMs, lista), { timestamp: true });
}

async function publishRank(channel, weekStartMs, options = {}) {
  const embed = buildRankEmbed(weekStartMs);
  const data = store.load();
  if (options.replace && data.tickets.rankMessageId) {
    const oldChannel = data.tickets.rankChannelId && data.tickets.rankChannelId !== channel.id
      ? await channel.client.channels.fetch(data.tickets.rankChannelId).catch(() => null)
      : channel;
    const existing = oldChannel
      ? await oldChannel.messages.fetch(data.tickets.rankMessageId).catch(() => null)
      : null;
    if (existing) await existing.delete().catch(() => {});
  } else if (data.tickets.rankChannelId === channel.id && data.tickets.rankMessageId) {
    const existing = await channel.messages.fetch(data.tickets.rankMessageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] });
      store.update((s) => {
        s.tickets.rankChannelId = channel.id;
        s.tickets.rankMessageId = existing.id;
      });
      return existing;
    }
  }
  const message = await channel.send({ embeds: [embed] });
  await message.pin().catch(() => {});
  store.update((s) => {
    s.tickets.rankChannelId = channel.id;
    s.tickets.rankMessageId = message.id;
  });
  return message;
}

async function refreshRank(client, weekStartMs = getWeekStart()) {
  const channelId = store.load().tickets.rankChannelId;
  if (!channelId || !client) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  return publishRank(channel, weekStartMs);
}

async function repost(client) {
  const channelId = store.load().tickets.rankChannelId;
  if (!channelId || !client) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  const message = await publishRank(channel, getWeekStart(), { replace: true });
  console.log(`[painel] Rank de tickets republicado em #${channel.name}`);
  return message;
}

async function postClosedWeek(client, previousWeekStart) {
  const channelId = store.load().tickets.rankChannelId;
  if (!channelId || !client || !previousWeekStart) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  await channel.send({ embeds: [buildRankEmbed(previousWeekStart, true)] }).catch(() => {});
  await refreshRank(client, getWeekStart());
}

async function recordClaim(client, { userId, ticketChannelId, ticketNumber }) {
  const weekStart = getWeekStart();
  const added = db.insertTicketClaim({
    userId,
    ticketChannelId,
    ticketNumber,
    weekStart,
  });
  if (added) {
    await refreshRank(client, weekStart).catch(() => {});
  }
  return added;
}

module.exports = {
  buildRankEmbed,
  publishRank,
  refreshRank,
  repost,
  postClosedWeek,
  recordClaim,
};
