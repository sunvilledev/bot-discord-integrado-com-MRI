const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const store = require('../store');
const { fromVisual, success, error } = require('../utils/embeds');
const { denyIfNotAdmin } = require('../utils/permissions');

const TARGETS = {
  tickets: {
    path: ['tickets', 'embed'],
    channelKey: ['tickets', 'panelChannelId'],
    messageKey: ['tickets', 'panelMessageId'],
    extraRows: 'tickets',
  },
  fivem: {
    path: ['fivem', 'embed'],
    channelKey: ['fivem', 'channelId'],
    messageKey: ['fivem', 'messageId'],
    extraRows: 'fivem',
  },
  hierarchy: {
    path: ['hierarchy', 'embed'],
    channelKey: ['hierarchy', 'channelId'],
    messageKey: ['hierarchy', 'messageId'],
    extraRows: 'hierarchy',
  },
  suggestions: {
    path: ['suggestions', 'embed'],
    channelKey: ['suggestions', 'panelChannelId'],
    messageKey: ['suggestions', 'panelMessageId'],
    extraRows: null,
  },
  verification: {
    path: ['verification', 'embed'],
    channelKey: ['verification', 'panelChannelId'],
    messageKey: ['verification', 'panelMessageId'],
    extraRows: null,
  },
  passlist: {
    path: ['passlist', 'embed'],
    channelKey: ['passlist', 'panelChannelId'],
    messageKey: ['passlist', 'panelMessageId'],
    extraRows: null,
  },
  passlistRelease: {
    path: ['passlist', 'releaseEmbed'],
    channelKey: ['passlist', 'releaseChannelId'],
    messageKey: ['passlist', 'releaseMessageId'],
    extraRows: null,
  },
  passlistApprovedPublic: { path: ['passlist', 'approvedPublicEmbed'] },
  passlistRejectedPublic: { path: ['passlist', 'rejectedPublicEmbed'] },
  timeclockPanel: {
    path: ['timeclock', 'embed'],
    channelKey: ['timeclock', 'channelId'],
    messageKey: ['timeclock', 'channelId'],
  },
  timeclockRank: {
    path: ['timeclock', 'rankEmbed'],
    channelKey: ['timeclock', 'rankChannelId'],
    messageKey: ['timeclock', 'rankChannelId'],
  },
  timeclockWeekly: { path: ['timeclock', 'weeklyEmbed'] },
  timeclockStart: { path: ['timeclock', 'startEmbed'] },
  timeclockStop: { path: ['timeclock', 'stopEmbed'] },
  ticketRank: {
    path: ['tickets', 'rankEmbed'],
    channelKey: ['tickets', 'rankChannelId'],
    messageKey: ['tickets', 'rankMessageId'],
  },
  ticketRankClosed: { path: ['tickets', 'rankClosedEmbed'] },
  ticketCloseDm: { path: ['tickets', 'closeDmEmbed'] },
  ticketRatingLog: { path: ['tickets', 'ratingLogEmbed'] },
  ingamePanel: {
    path: ['commands', 'embed'],
    channelKey: ['commands', 'panelChannelId'],
    messageKey: ['commands', 'panelMessageId'],
  },
  ingameBanLog: { path: ['commands', 'banLogEmbed'] },
  ingameUnbanLog: { path: ['commands', 'unbanLogEmbed'] },
  ingameWarnLog: { path: ['commands', 'warnLogEmbed'] },
  ingameUnwarnLog: { path: ['commands', 'unwarnLogEmbed'] },
  logsJoin: { path: ['logs', 'joinEmbed'] },
  logsLeave: { path: ['logs', 'leaveEmbed'] },
  antilinkWarn: { path: ['antilink', 'warnEmbed'] },
  callsLog: { path: ['calls', 'logEmbed'] },
  backupLog: { path: ['backup', 'embed'] },
};

function getPath(obj, keys) {
  return keys.reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function setPath(obj, keys, value) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
}

function editorButtons(target, backId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`editor:${target}:title`).setLabel('Título').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`editor:${target}:description`).setLabel('Descrição').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`editor:${target}:color`).setLabel('Cor').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`editor:${target}:footer`).setLabel('Rodapé').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`editor:${target}:image`).setLabel('Imagem').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`editor:${target}:thumbnail`).setLabel('Thumbnail').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`editor:${target}:preview`).setLabel('Pré-visualizar').setStyle(ButtonStyle.Success),
  );
  const rows = [row1, row2];
  if (backId) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(backId).setLabel('Voltar').setStyle(ButtonStyle.Secondary),
    ));
  }
  return rows;
}

function editorPayload(target, label, backId) {
  return {
    embeds: [fromVisual({
      title: `Editar embed • ${label}`,
      description: 'Altere título, texto, cor, imagem e rodapé. O painel publicado no canal atualiza na hora.',
      color: 0xc9a227,
    })],
    components: editorButtons(target, backId),
  };
}

async function openEditor(interaction, target, label) {
  if (await denyIfNotAdmin(interaction)) return;
  if (!TARGETS[target]) {
    await interaction.reply({ embeds: [error('Painel inválido.')], ephemeral: true });
    return;
  }
  await interaction.reply({
    ...editorPayload(target, label),
    ephemeral: true,
  });
}

function fieldModal(target, field) {
  const labels = {
    title: ['Título', 'Novo título do embed', TextInputStyle.Short, 256],
    description: ['Descrição', 'Nova descrição (use \\n para quebra de linha)', TextInputStyle.Paragraph, 4000],
    color: ['Cor', 'Hexadecimal, ex: C9A227 ou #C9A227', TextInputStyle.Short, 8],
    footer: ['Rodapé', 'Texto do rodapé', TextInputStyle.Short, 2048],
    image: ['Imagem', 'URL da imagem (vazio para remover)', TextInputStyle.Short, 500],
    thumbnail: ['Thumbnail', 'URL da thumbnail (vazio para remover)', TextInputStyle.Short, 500],
  };
  const [title, placeholder, style, max] = labels[field];
  const data = store.load();
  const visual = getPath(data, TARGETS[target].path) || {};
  const current = visual[field] == null ? '' : String(visual[field]);

  const modal = new ModalBuilder()
    .setCustomId(`editor-modal:${target}:${field}`)
    .setTitle(title);

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(placeholder.slice(0, 45))
    .setStyle(style)
    .setRequired(false)
    .setMaxLength(max);

  if (current && current.length <= max) input.setValue(field === 'color' && typeof visual.color === 'number'
    ? visual.color.toString(16).padStart(6, '0').toUpperCase()
    : current.slice(0, max));

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function refreshPublished(client, target) {
  const meta = TARGETS[target];
  if (!meta) return;

  if (target === 'timeclockPanel') {
    await require('../ingame/timeclock/service').refreshPanel(client);
    return;
  }
  if (target === 'timeclockRank') {
    await require('../ingame/timeclock/service').refreshRank(client);
    return;
  }
  if (target === 'ticketRank') {
    await require('./ticket-rank').refreshRank(client);
    return;
  }
  if (target === 'ingamePanel') {
    await require('../ingame/panels/fixed').ensureFixedPanel(client);
    return;
  }

  if (!meta.channelKey || !meta.messageKey) return;
  const data = store.load();
  const channelId = getPath(data, meta.channelKey);
  const messageId = getPath(data, meta.messageKey);
  if (!channelId || !messageId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  if (target === 'tickets') {
    const tickets = require('./tickets');
    await message.edit(tickets.buildPanel(data)).catch((err) => {
      console.error('[tickets] falha ao atualizar o painel:', err.message);
    });
    return;
  }
  if (target === 'fivem') {
    const fivem = require('./fivem');
    await message.edit(fivem.buildPanel(data));
    return;
  }
  if (target === 'hierarchy') {
    const hierarchy = require('./hierarchy');
    await hierarchy.refreshMessage(client);
    return;
  }
  if (target === 'suggestions') {
    const suggestions = require('./suggestions');
    await message.edit(suggestions.buildPanel(data));
    return;
  }
  if (target === 'verification') {
    const verification = require('./verification');
    await message.edit(verification.buildPanel(data));
    return;
  }
  if (target === 'passlist') {
    const passlist = require('./passlist');
    await message.edit(passlist.buildPanel(data));
    return;
  }
  if (target === 'passlistRelease') {
    const passlist = require('./passlist');
    await message.edit(passlist.buildReleasePanel(data));
  }
}

async function handleButton(interaction) {
  const [, target, field] = interaction.customId.split(':');
  if (await denyIfNotAdmin(interaction)) return;
  if (!TARGETS[target]) return;

  if (field === 'preview') {
    const data = store.load();
    const visual = getPath(data, TARGETS[target].path);
    await interaction.reply({ embeds: [fromVisual(visual)], ephemeral: true });
    return;
  }

  await interaction.showModal(fieldModal(target, field));
}

async function handleModal(interaction) {
  const [, target, field] = interaction.customId.split(':');
  if (await denyIfNotAdmin(interaction)) return;
  if (!TARGETS[target]) return;

  let value = interaction.fields.getTextInputValue('value').trim();
  if (field === 'description') value = value.replace(/\\n/g, '\n');
  if (field === 'color') {
    const hex = value.replace('#', '');
    const n = Number.parseInt(hex, 16);
    if (value && Number.isNaN(n)) {
      await interaction.reply({ embeds: [error('Cor inválida. Use hex, exemplo: C9A227')], ephemeral: true });
      return;
    }
    value = value ? n : 0xc9a227;
  }

  store.update((data) => {
    const visual = getPath(data, TARGETS[target].path);
    visual[field] = value;
  });

  await refreshPublished(interaction.client, target);
  if (interaction.message) {
    await interaction.reply({
      embeds: [success('Embed atualizado e republicado no canal (se já estiver enviado).')],
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({
    embeds: [success('Embed atualizado e republicado no canal (se já estiver enviado).')],
    ephemeral: true,
  });
}

module.exports = { openEditor, handleButton, handleModal, refreshPublished, editorButtons, editorPayload };
