const { timeclock } = require('../config');
const store = require('../../store');
const { isPermissionManager } = require('../utils/staff');
const {
  purgeOldSessions,
  startSession,
  stopSession,
  getMessage,
  setMessage,
} = require('./store');
const { getWeekStart, formatDuration, formatDateTime, describeReset } = require('./time');
const { fromTemplate } = require('../../utils/embeds');
const { IDS, buildPanelEmbed, buildPanelRows, buildRankEmbed, buildTimeEmbed } = require('./panel');
const { getWeeklyRankForStart } = require('./store');

const REFRESH_MS = 30000;
let clientRef = null;
let lastWeekStart = 0;
let refreshTimer = null;

async function fetchStoredMessage(client, kind) {
  const stored = getMessage(kind);
  const channelId = kind === 'rank' ? (stored.channelId || timeclock.rankChannelId) : (stored.channelId || timeclock.channelId);
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  if (stored.messageId) {
    const existing = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (existing) return { channel, message: existing };
  }
  return { channel, message: null };
}

async function deleteStoredMessage(channel, stored) {
  if (!stored?.messageId) return;
  let target = channel;
  if (stored.channelId && stored.channelId !== channel.id) {
    target = await channel.client.channels.fetch(stored.channelId).catch(() => null);
  }
  if (!target) return;
  const existing = await target.messages.fetch(stored.messageId).catch(() => null);
  if (!existing) return;
  if (existing.pinned) await existing.unpin().catch(() => {});
  await existing.delete().catch((err) => {
    console.error(`[painel] não apaguei a mensagem antiga do ponto: ${err.message}`);
  });
}

async function publishPanel(channel, options = {}) {
  const payload = {
    embeds: [buildPanelEmbed()],
    components: buildPanelRows(),
  };
  const stored = getMessage('panel');
  if (options.replace) {
    await deleteStoredMessage(channel, stored);
  } else if (stored.channelId === channel.id && stored.messageId) {
    const existing = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      setMessage('panel', { channelId: channel.id, messageId: existing.id });
      return existing;
    }
  }
  const message = await channel.send(payload);
  await message.pin().catch(() => {});
  setMessage('panel', { channelId: channel.id, messageId: message.id });
  return message;
}

async function publishRank(channel, highlightedUserId, options = {}) {
  const payload = { embeds: [buildRankEmbed(highlightedUserId)] };
  const stored = getMessage('rank');
  if (options.replace) {
    await deleteStoredMessage(channel, stored);
  } else if (stored.channelId === channel.id && stored.messageId) {
    const existing = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      setMessage('rank', { channelId: channel.id, messageId: existing.id });
      return existing;
    }
  }
  const message = await channel.send(payload);
  await message.pin().catch(() => {});
  setMessage('rank', { channelId: channel.id, messageId: message.id });
  return message;
}

async function refreshPanel(client = clientRef) {
  if (!client) return;
  const found = await fetchStoredMessage(client, 'panel');
  if (!found?.message) return;
  await found.message.edit({
    embeds: [buildPanelEmbed()],
    components: buildPanelRows(),
  }).catch(() => {});
}

async function refreshRank(client = clientRef, highlightedUserId) {
  if (!client) return;
  const found = await fetchStoredMessage(client, 'rank');
  if (found?.message) {
    await found.message.edit({ embeds: [buildRankEmbed(highlightedUserId)] }).catch(() => {});
    return found.message;
  }
  if (found?.channel) {
    return publishRank(found.channel, highlightedUserId);
  }
  return null;
}

async function markWeekLogged(weekStart) {
  store.update((s) => {
    s.timeclock.lastWeeklyLogWeekStart = weekStart;
  });
}

async function ensureTimeclock(client) {
  purgeOldSessions();
  const weekStart = getWeekStart();
  const storedWeek = Number(store.load().timeclock.lastWeeklyLogWeekStart || 0);
  if (storedWeek && storedWeek !== weekStart) {
    await postWeeklyRankLog(client, storedWeek).catch((err) => console.error('[ponto-log-semanal]', err.message));
    try {
      await require('../../systems/ticket-rank').postClosedWeek(client, storedWeek);
    } catch (err) {
      console.error('[ticket-rank] semana:', err.message);
    }
  }
  lastWeekStart = weekStart;
  await markWeekLogged(weekStart);

  if (timeclock.channelId) {
    const found = await fetchStoredMessage(client, 'panel');
    if (!found?.channel) {
      console.error(`Bate-ponto: sem acesso ao canal ${timeclock.channelId}.`);
    } else {
      await publishPanel(found.channel, { replace: true });
      console.log(`Bate-ponto republicado em #${found.channel.name}`);
    }
  } else {
    console.log('Bate-ponto: use /configurar → Bate-ponto para publicar o painel.');
  }

  if (timeclock.rankChannelId) {
    const found = await fetchStoredMessage(client, 'rank');
    if (!found?.channel) {
      console.error(`Rank de ponto: sem acesso ao canal ${timeclock.rankChannelId}.`);
    } else {
      await publishRank(found.channel, undefined, { replace: true });
      console.log(`Rank de ponto republicado em #${found.channel.name}`);
    }
  }
}

function startTimeclock(client) {
  clientRef = client;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    try {
      purgeOldSessions();
      const weekStart = getWeekStart();
      await refreshPanel(client);
      if (weekStart !== lastWeekStart) {
        const previous = lastWeekStart;
        lastWeekStart = weekStart;
        await postWeeklyRankLog(client, previous).catch((err) => console.error('[ponto-log-semanal]', err.message));
        await refreshRank(client);
        try {
          const ticketRank = require('../../systems/ticket-rank');
          await ticketRank.postClosedWeek(client, previous);
        } catch (err) {
          console.error('[ticket-rank] semana:', err.message);
        }
        await markWeekLogged(weekStart);
      }
    } catch (error) {
      console.error('Falha ao atualizar o bate-ponto:', error.message);
    }
  }, REFRESH_MS);
}

function canUseTimeclock(member) {
  if (!member) return false;
  if (isPermissionManager(member)) return true;
  if (!timeclock.roleId) return true;
  return member.roles?.cache?.has(timeclock.roleId);
}

async function sendTimeclockLog(client, embed) {
  const channelId = timeclock.logChannelId;
  if (!channelId || !client) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function postWeeklyRankLog(client, previousWeekStart) {
  const channelId = timeclock.weeklyLogChannelId;
  if (!channelId || !client || !previousWeekStart) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const nowMs = Date.now();
  const { weekStart, weekEnd, ranking } = getWeeklyRankForStart(previousWeekStart, nowMs);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranking.slice(0, 25).map((row, index) => {
    const medal = medals[index] || `**${index + 1}.**`;
    return `${medal} <@${row.userId}> — **${formatDuration(row.ms)}**`;
  });
  await channel.send({
    embeds: [fromTemplate(store.load().timeclock.weeklyEmbed, {
      periodo: `${formatDateTime(weekStart)} → ${formatDateTime(weekEnd)}`,
      reset: describeReset(),
      lista: lines.length ? lines.join('\n') : 'Ninguém bateu ponto nesta semana.',
    }, { timestamp: true })],
  }).catch((err) => console.error('[ponto-log-semanal]', err.message));
}

async function handleStart(interaction) {
  if (!canUseTimeclock(interaction.member)) {
    await interaction.reply({ content: 'Seu cargo não pode bater ponto.', ephemeral: true });
    return;
  }
  purgeOldSessions();
  const result = startSession(interaction.user.id);
  if (result.error) {
    await interaction.reply({ content: result.error, ephemeral: true });
    return;
  }
  await interaction.reply({
    embeds: [buildTimeEmbed(interaction.user.id)],
    ephemeral: true,
  });
  await refreshPanel(interaction.client);
  await sendTimeclockLog(interaction.client, fromTemplate(store.load().timeclock.startEmbed, {
    user: `${interaction.user}`,
  }, { timestamp: true }));
}

async function handleStop(interaction) {
  if (!canUseTimeclock(interaction.member)) {
    await interaction.reply({ content: 'Seu cargo não pode bater ponto.', ephemeral: true });
    return;
  }
  purgeOldSessions();
  const result = stopSession(interaction.user.id);
  if (result.error) {
    await interaction.reply({ content: result.error, ephemeral: true });
    return;
  }
  await interaction.reply({
    content: `Ponto finalizado. Nesta sessão: **${formatDuration(result.session.durationMs)}**.`,
    embeds: [buildTimeEmbed(interaction.user.id)],
    ephemeral: true,
  });
  await refreshPanel(interaction.client);
  await refreshRank(interaction.client, interaction.user.id);
  await sendTimeclockLog(interaction.client, fromTemplate(store.load().timeclock.stopEmbed, {
    user: `${interaction.user}`,
    duracao: formatDuration(result.session.durationMs),
  }, { timestamp: true }));
}

async function handleTime(interaction) {
  if (!canUseTimeclock(interaction.member)) {
    await interaction.reply({ content: 'Seu cargo não pode ver o bate-ponto.', ephemeral: true });
    return;
  }
  purgeOldSessions();
  await interaction.reply({
    embeds: [buildTimeEmbed(interaction.user.id)],
    ephemeral: true,
  });
}

async function handleTimeclockButton(interaction) {
  if (interaction.customId === IDS.start) {
    await handleStart(interaction);
    return true;
  }
  if (interaction.customId === IDS.stop) {
    await handleStop(interaction);
    return true;
  }
  if (interaction.customId === IDS.time) {
    await handleTime(interaction);
    return true;
  }
  return false;
}

module.exports = {
  ensureTimeclock,
  startTimeclock,
  publishPanel,
  publishRank,
  refreshPanel,
  refreshRank,
  handleTimeclockButton,
  canUseTimeclock,
};
