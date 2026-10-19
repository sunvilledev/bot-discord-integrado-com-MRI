const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { brand } = require('../config');
const { ACTIONS, CATEGORIES, getActionsByCategory } = require('../catalog/actions');
const { getRoleActions, listConfiguredRoles } = require('../permissions/store');

const PERM_IDS = {
  open: 'sunville:perm:open',
  role: 'sunville:perm:role',
  actsPrefix: 'sunville:perm:acts:',
  delPrefix: 'sunville:perm:del:',
};

function parseActsCustomId(customId) {
  if (!customId.startsWith(PERM_IDS.actsPrefix)) return null;
  const rest = customId.slice(PERM_IDS.actsPrefix.length);
  const [category, roleId] = rest.split(':');
  return { category, roleId };
}

function parseDelCustomId(customId) {
  if (!customId.startsWith(PERM_IDS.delPrefix)) return null;
  return customId.slice(PERM_IDS.delPrefix.length);
}

function buildPermissionEmbed(roleId) {
  const configured = listConfiguredRoles();
  const lines = configured.length
    ? configured.map((id) => {
        const count = getRoleActions(id).length;
        const mark = id === roleId ? '→ ' : '';
        return `${mark}<@&${id}> — **${count}** função(ões)`;
      })
    : ['Nenhum cargo configurado ainda.'];

  const selected = roleId
    ? `\n\nCargo selecionado: <@&${roleId}>\nMarque as funções nas listas e elas são salvas na hora.`
    : '\n\nSelecione um cargo para adicionar e definir as funções.';

  return new EmbedBuilder()
    .setColor(brand.color)
    .setTitle('Permissões por cargo')
    .setDescription(`${lines.join('\n')}${selected}`)
    .setFooter({ text: 'Só o cargo de configuração consegue alterar isto.' });
}

function buildPermissionOpenRow() {
  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(PERM_IDS.role)
      .setPlaceholder('Adicionar / configurar um cargo')
      .setMinValues(1)
      .setMaxValues(1),
  );
}

function buildPermissionEditRows(roleId) {
  const current = new Set(getRoleActions(roleId));
  const rows = [];

  for (const category of CATEGORIES) {
    const actions = getActionsByCategory(category.id);
    if (!actions.length) continue;

    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PERM_IDS.actsPrefix}${category.id}:${roleId}`)
          .setPlaceholder(`${category.label} — selecione as funções`)
          .setMinValues(0)
          .setMaxValues(actions.length)
          .addOptions(
            actions.map((action) => ({
              label: action.label.slice(0, 100),
              value: action.id,
              default: current.has(action.id),
            })),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PERM_IDS.delPrefix}${roleId}`)
        .setLabel('Remover este cargo')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  return rows.slice(0, 5);
}

module.exports = {
  PERM_IDS,
  ACTIONS,
  parseActsCustomId,
  parseDelCustomId,
  buildPermissionEmbed,
  buildPermissionOpenRow,
  buildPermissionEditRows,
};
