const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { brand } = require('../config');
const { fromTemplate } = require('../../utils/embeds');
const store = require('../../store');
const { ACTIONS, CATEGORIES, getAction, getActionsByCategory } = require('../catalog/actions');

const IDS = {
  playersButton: 'sunville:players',
  statusButton: 'sunville:status',
  permsButton: 'sunville:perm:open',
  categoryPrefix: 'sunville:cat:',
  runPrefix: 'sunville:run:',
  proofSkip: 'sunville:proof:skip',
  proofConfirm: 'sunville:proof:confirm',
  proofMore: 'sunville:proof:more',
};

function categoryCustomId(categoryId) {
  return `${IDS.categoryPrefix}${categoryId}`;
}

function runCustomId(actionId) {
  return `${IDS.runPrefix}${actionId}`;
}

function parseCategoryId(customId) {
  if (!customId.startsWith(IDS.categoryPrefix)) return null;
  return customId.slice(IDS.categoryPrefix.length);
}

function parseRunId(customId) {
  if (!customId.startsWith(IDS.runPrefix)) return null;
  return customId.slice(IDS.runPrefix.length);
}

function buildPanelEmbed(players = []) {
  const fields = CATEGORIES.map((category) => {
    const lines = getActionsByCategory(category.id)
      .map((action) => `• ${action.label}`)
      .join('\n');
    return {
      name: category.label,
      value: lines.slice(0, 1024) || '—',
      inline: true,
    };
  });

  const playerLines = players.length
    ? players
        .slice(0, 20)
        .map((player) => `\`#${player.id}\` ${player.name}`)
        .join('\n') + (players.length > 20 ? `\n… e mais ${players.length - 20}` : '')
    : 'Nenhum jogador online.';

  fields.push({
    name: `Jogadores online (${players.length}) • atualiza a cada 10s`,
    value: playerLines.slice(0, 1024),
    inline: false,
  });

  return fromTemplate(store.load().commands.embed, {
    acoes: String(ACTIONS.length),
  }, { timestamp: true }).addFields(fields);
}

function buildPanelRows() {
  const selects = CATEGORIES.map((category) => {
    const options = getActionsByCategory(category.id).map((action) => ({
      label: action.label.slice(0, 100),
      value: action.id,
      description: action.fields.length
        ? `${action.fields.length} campo(s) no formulário`
        : 'Executa na hora',
    }));

    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(categoryCustomId(category.id))
        .setPlaceholder(category.label)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options),
    );
  });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.playersButton)
      .setLabel('Jogadores online')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.statusButton)
      .setLabel('Status do servidor')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.permsButton)
      .setLabel('Gerenciar cargos')
      .setStyle(ButtonStyle.Success),
  );

  return [...selects, buttons];
}

function buildActionModal(action) {
  const modal = new ModalBuilder()
    .setCustomId(runCustomId(action.id))
    .setTitle(action.label.slice(0, 45));

  for (const field of action.fields.slice(0, 5)) {
    const paragraph = field.style === 'paragraph';
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label.slice(0, 45))
          .setPlaceholder(field.placeholder || '')
          .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(Boolean(field.required))
          .setMaxLength(field.maxLength || (paragraph ? 400 : 80)),
      ),
    );
  }

  return modal;
}

function readModalFields(interaction, action) {
  const fields = {};
  for (const field of action.fields) {
    try {
      fields[field.id] = interaction.fields.getTextInputValue(field.id).trim();
    } catch {
      fields[field.id] = '';
    }
  }
  return fields;
}

module.exports = {
  IDS,
  getAction,
  buildPanelEmbed,
  buildPanelRows,
  buildActionModal,
  parseCategoryId,
  parseRunId,
  readModalFields,
};
