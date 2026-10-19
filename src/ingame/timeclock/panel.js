const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { brand, timeclock } = require('../config');
const guildStore = require('../../store');
const { fromTemplate } = require('../../utils/embeds');
const { formatDuration, formatDateTime, describeReset } = require('./time');
const { getUserTotals, getWeeklyRank, getWeeklyRankForStart, listOpenSessions } = require('./store');

const IDS = {
  start: 'sunville:ponto:start',
  stop: 'sunville:ponto:stop',
  time: 'sunville:ponto:time',
};

function isTimeclockButton(customId) {
  return customId === IDS.start || customId === IDS.stop || customId === IDS.time;
}

function buildPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(IDS.start).setLabel('Iniciar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(IDS.stop).setLabel('Finalizar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(IDS.time).setLabel('Tempo').setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildPanelEmbed(nowMs = Date.now()) {
  const open = listOpenSessions();
  const openLines = open.length
    ? open
        .slice(0, 20)
        .map((session) => `• <@${session.userId}> — **${formatDuration(nowMs - session.startedAt)}**`)
        .join('\n')
    : 'Ninguém com ponto aberto.';

  return fromTemplate(guildStore.load().timeclock.embed, {
    reset: describeReset(),
    fuso: timeclock.timezone,
  }, { timestamp: nowMs }).addFields({
    name: `Em serviço agora (${open.length})`,
    value: openLines.slice(0, 1024),
  });
}

function buildTimeEmbed(userId, nowMs = Date.now()) {
  const totals = getUserTotals(userId, nowMs);
  const openText = totals.open
    ? `Aberto há **${formatDuration(totals.openMs)}** (desde ${formatDateTime(totals.open.startedAt)})`
    : 'Nenhum ponto aberto.';

  return new EmbedBuilder()
    .setColor(brand.color)
    .setTitle('Seu tempo')
    .setDescription(`<@${userId}>`)
    .addFields(
      { name: 'Aberto agora', value: openText, inline: false },
      { name: 'Total do dia', value: formatDuration(totals.dayMs), inline: true },
      { name: 'Total da semana', value: formatDuration(totals.weekMs), inline: true },
      { name: 'Total do mês', value: formatDuration(totals.monthMs), inline: true },
    )
    .setFooter({ text: `Semana atual até o próximo ${describeReset()}` })
    .setTimestamp(nowMs);
}

function buildRankEmbed(highlightedUserId, nowMs = Date.now(), weekStartMs) {
  const { weekStart, weekEnd, ranking } = weekStartMs
    ? getWeeklyRankForStart(weekStartMs, nowMs)
    : getWeeklyRank(nowMs);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranking.slice(0, 25).map((row, index) => {
    const medal = medals[index] || `**${index + 1}.**`;
    const mark = highlightedUserId && row.userId === String(highlightedUserId) ? ' ←' : '';
    return `${medal} <@${row.userId}> — **${formatDuration(row.ms)}**${mark}`;
  });

  return fromTemplate(guildStore.load().timeclock.rankEmbed, {
    periodo: `${formatDateTime(weekStart)} → ${formatDateTime(weekEnd)}`,
    reset: describeReset(),
    lista: lines.length ? lines.join('\n') : 'Ninguém bateu ponto nesta semana.',
  }, { timestamp: nowMs });
}

module.exports = {
  IDS,
  isTimeclockButton,
  buildPanelRows,
  buildPanelEmbed,
  buildTimeEmbed,
  buildRankEmbed,
};
