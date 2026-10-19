const { EmbedBuilder } = require('discord.js');
const { brand, discord } = require('../config');
const fivem = require('../fivem/client');
const { getCachedPlayers, formatPlayerList } = require('../fivem/players');
const guildStore = require('../../store');
const { fromTemplate } = require('../../utils/embeds');
const {
  denyIfNotStaff,
  denyIfNotManager,
  denyIfCannotUseAction,
} = require('../utils/staff');
const {
  IDS,
  getAction,
  buildActionModal,
  parseCategoryId,
  parseRunId,
  readModalFields,
} = require('../panels/admin');
const {
  PERM_IDS,
  parseActsCustomId,
  parseDelCustomId,
  buildPermissionEmbed,
  buildPermissionOpenRow,
  buildPermissionEditRows,
} = require('../panels/permissions');
const { getActionsByCategory } = require('../catalog/actions');
const { mergeRoleActions, removeRole, setRoleActions, getRoleActions } = require('../permissions/store');
const { fixPanelInChannel } = require('../panels/fixed');
const { handleTimeclockButton } = require('../timeclock/service');
const { isTimeclockButton } = require('../timeclock/panel');
const {
  extractLinks,
  waitForProofs,
  handleProofSkip,
  handleProofConfirm,
  handleProofMore,
  publishModeration,
  sendProofFollowUp,
  warnResultMessage,
  buildActionResultEmbeds,
} = require('../bans/announce');

function errorEmbed(message) {
  return new EmbedBuilder()
    .setColor(brand.colorError)
    .setTitle('Falha')
    .setDescription(message);
}

function successEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(brand.colorSuccess)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (fields.length) embed.addFields(fields);
  return embed;
}

async function sendLog(client, text) {
  if (!discord.logChannelId) return;
  const channel = await client.channels.fetch(discord.logChannelId).catch(() => null);
  if (!channel) return;
  await channel.send({ content: text }).catch(() => {});
}

const BAN_PERMANENT_SECONDS = 2147483647;
const BAN_PERMANENT_DAYS = 9999;

function parseBanDays(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) {
    return { error: 'Informe a duração em dias. Use 9999 para permanente.' };
  }
  const days = Number(raw);
  if (days === BAN_PERMANENT_DAYS) {
    return { days, label: 'Permanente' };
  }
  if (days < 1) {
    return { error: 'Informe pelo menos 1 dia, ou 9999 para permanente.' };
  }
  return {
    days,
    label: days === 1 ? '1 dia' : `${days} dias`,
  };
}

function formatBanDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return 'Permanente';
  if (n === BAN_PERMANENT_DAYS || n >= BAN_PERMANENT_SECONDS || n >= 60 * 60 * 24 * 365 * 10) return 'Permanente';
  const days = Math.floor(n / 86400);
  const hours = Math.floor((n % 86400) / 3600);
  const minutes = Math.floor((n % 3600) / 60);
  const secs = Math.floor(n % 60);
  const parts = [];
  if (days) parts.push(`${days} dia${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}min`);
  if (secs && !days && !hours) parts.push(`${secs}s`);
  return parts.join(' ') || `${n}s`;
}

function resolvePlayerName(playerId) {
  const cached = getCachedPlayers();
  const player = (cached.players || []).find((entry) => String(entry.id) === String(playerId));
  return player?.name || `ID ${playerId}`;
}

async function sendBanLog(interaction, fields, resultMessage) {
  const data = guildStore.load();
  const channelId = data.commands?.banLogChannelId;
  if (!channelId) return;
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const playerId = fields.playerId || '—';
  await channel.send({
    embeds: [fromTemplate(data.commands.banLogEmbed, {
      staff: `<@${interaction.user.id}>`,
      staffTag: interaction.user.tag,
      staffId: interaction.user.id,
      jogador: resolvePlayerName(playerId),
      playerId,
      motivo: fields.reason || 'Sem motivo',
      duracao: fields.durationLabel || fields.duration || '—',
      duracaoTexto: fields.durationLabel || formatBanDuration(fields.duration),
      resultado: resultMessage || '—',
    }, { timestamp: true })],
  }).catch(() => {});
}

async function runAction(interaction, action, fields) {
  const isWarnAction = action.id === 'advertencia_player' || action.id === 'remove_advertencia';
  let result;

  if (action.id === 'ban_player') {
    const parsed = parseBanDays(fields.duration);
    if (parsed.error) {
      await interaction.editReply({ embeds: [errorEmbed(parsed.error)], components: [] });
      return;
    }
    fields.duration = String(parsed.days);
    fields.durationLabel = parsed.label;
  }

  try {
    result = await fivem.executeCommand(action.id, fields);
  } catch (error) {
    if (!isWarnAction) throw error;
    result = { message: error.message, announce: null };
  }

  const message = result.result?.message || result.message || `Comando \`${action.label}\` executado.`;

  await interaction.editReply({
    embeds: buildActionResultEmbeds(action, result),
    components: [],
  });

  const extras = Object.entries(fields)
    .filter(([key, value]) => value && key !== 'durationLabel')
    .map(([key, value]) => (
      key === 'duration' && fields.durationLabel ? `duração=${fields.durationLabel}` : `${key}=${value}`
    ))
    .join(' • ');

  await sendLog(
    interaction.client,
    `⚡ **${interaction.user.tag}** executou **${action.label}**${extras ? ` • ${extras}` : ''}`,
  );

  if (action.id === 'ban_player') {
    await sendBanLog(interaction, fields, message);
  }

  const announced = await publishModeration(interaction.client, action, result, interaction.user, fields);
  if (announced && announced.type === 'ban') {
    await sendProofFollowUp(interaction.client, announced);
  }
  if (announced && (announced.type === 'warn' || announced.type === 'unwarn')) {
    const payload = result?.result || result;
    if (payload) payload.message = warnResultMessage(announced);
    await interaction.editReply({
      embeds: buildActionResultEmbeds(action, result),
      components: [],
    });
  }
}

async function handlePainelCommand(interaction) {
  if (await denyIfNotStaff(interaction)) return;
  await interaction.reply({
    content: 'O painel fica fixo no canal configurado. Use `/fixar-painel` nesse canal se ele ainda não existir.',
    ephemeral: true,
  });
}

async function handleFixarPainel(interaction) {
  if (await denyIfNotManager(interaction)) return;
  await interaction.deferReply({ ephemeral: true });
  const message = await fixPanelInChannel(interaction.channel);
  await interaction.editReply({
    embeds: [successEmbed('Painel fixo', `O painel ficou neste canal: ${message.url}`)],
  });
}

async function handlePlayersButton(interaction) {
  if (await denyIfNotStaff(interaction)) return;
  await interaction.deferReply({ ephemeral: true });

  try {
    const cached = getCachedPlayers();
    const players = cached.players || [];

    await interaction.editReply({
      embeds: [
        successEmbed(
          `Jogadores online (${players.length})`,
          formatPlayerList(players, 40),
        ),
      ],
    });
  } catch (error) {
    await interaction.editReply({ embeds: [errorEmbed(error.message)] });
  }
}

async function handleStatusButton(interaction) {
  if (await denyIfNotStaff(interaction)) return;
  await interaction.deferReply({ ephemeral: true });

  try {
    const data = await fivem.getStatus();
    await interaction.editReply({
      embeds: [
        successEmbed(
          'Servidor FiveM',
          'Conexão com a MRI QBCore/Qbox confirmada.',
          [
            { name: 'Hostname', value: String(data.hostname || '—'), inline: true },
            { name: 'Jogadores', value: String(data.players ?? 0), inline: true },
            { name: 'Framework', value: String(data.framework || '—'), inline: true },
          ],
        ),
      ],
    });
  } catch (error) {
    await interaction.editReply({ embeds: [errorEmbed(error.message)] });
  }
}

async function handleCategorySelect(interaction) {
  if (await denyIfNotStaff(interaction)) return;

  const action = getAction(interaction.values[0]);
  if (!action) {
    await interaction.reply({ embeds: [errorEmbed('Comando não encontrado.')], ephemeral: true });
    return;
  }

  if (await denyIfCannotUseAction(interaction, action.id)) return;

  if (action.fields.length === 0) {
    await interaction.deferReply({ ephemeral: true });
    try {
      await runAction(interaction, action, {});
    } catch (error) {
      await interaction.editReply({ embeds: [errorEmbed(error.message)] });
    }
    return;
  }

  await interaction.showModal(buildActionModal(action));
}

async function handleActionModal(interaction) {
  if (await denyIfNotStaff(interaction)) return;

  const actionId = parseRunId(interaction.customId);
  const action = getAction(actionId);
  if (!action) {
    await interaction.reply({ embeds: [errorEmbed('Comando não encontrado.')], ephemeral: true });
    return;
  }

  if (await denyIfCannotUseAction(interaction, action.id)) return;

  await interaction.deferReply({ ephemeral: true });

  const fields = readModalFields(interaction, action);
  try {
    if (action.proof) {
      const extra = await waitForProofs(interaction, fields);
      fields.proofLinks = [...extractLinks(fields.proofs), ...(extra.links || [])];
      fields.proofFiles = extra.files || [];
      await interaction.editReply({
        embeds: [successEmbed(action.label, 'Executando...')],
        components: [],
      });
    }
    await runAction(interaction, action, fields);
  } catch (error) {
    await interaction.editReply({ embeds: [errorEmbed(error.message)], components: [] });
  }
}

async function handlePermsOpen(interaction) {
  if (await denyIfNotManager(interaction)) return;
  await interaction.reply({
    embeds: [buildPermissionEmbed()],
    components: [buildPermissionOpenRow()],
    ephemeral: true,
  });
}

async function handlePermsRole(interaction) {
  if (await denyIfNotManager(interaction)) return;
  const roleId = interaction.values[0];
  if (!getRoleActions(roleId).length) {
    setRoleActions(roleId, []);
  }

  await interaction.update({
    embeds: [buildPermissionEmbed(roleId)],
    components: buildPermissionEditRows(roleId),
  });
}

async function handlePermsActions(interaction) {
  if (await denyIfNotManager(interaction)) return;
  const parsed = parseActsCustomId(interaction.customId);
  if (!parsed) return;

  const categoryActions = getActionsByCategory(parsed.category).map((action) => action.id);
  mergeRoleActions(parsed.roleId, interaction.values, categoryActions);

  await interaction.update({
    embeds: [buildPermissionEmbed(parsed.roleId)],
    components: buildPermissionEditRows(parsed.roleId),
  });
}

async function handlePermsDelete(interaction) {
  if (await denyIfNotManager(interaction)) return;
  const roleId = parseDelCustomId(interaction.customId);
  if (!roleId) return;
  removeRole(roleId);
  await interaction.update({
    embeds: [buildPermissionEmbed()],
    components: [buildPermissionOpenRow()],
  });
}

function isIngameCustomId(customId) {
  return Boolean(customId && customId.startsWith('sunville:'));
}

async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'painel') {
        await handlePainelCommand(interaction);
        return;
      }
      if (interaction.commandName === 'fixar-painel') {
        await handleFixarPainel(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === IDS.proofSkip) {
        await handleProofSkip(interaction);
        return;
      }
      if (interaction.customId === IDS.proofConfirm) {
        await handleProofConfirm(interaction);
        return;
      }
      if (interaction.customId === IDS.proofMore) {
        await handleProofMore(interaction);
        return;
      }
      if (isTimeclockButton(interaction.customId)) {
        await handleTimeclockButton(interaction);
        return;
      }
      if (interaction.customId === IDS.playersButton) {
        await handlePlayersButton(interaction);
        return;
      }
      if (interaction.customId === IDS.statusButton) {
        await handleStatusButton(interaction);
        return;
      }
      if (interaction.customId === PERM_IDS.open || interaction.customId === IDS.permsButton) {
        await handlePermsOpen(interaction);
        return;
      }
      if (parseDelCustomId(interaction.customId)) {
        await handlePermsDelete(interaction);
        return;
      }
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === PERM_IDS.role) {
      await handlePermsRole(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && parseActsCustomId(interaction.customId)) {
      await handlePermsActions(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && parseCategoryId(interaction.customId)) {
      await handleCategorySelect(interaction);
      return;
    }

    if (interaction.isModalSubmit() && parseRunId(interaction.customId)) {
      await handleActionModal(interaction);
    }
  } catch (error) {
    console.error('Erro na interação in-game:', error);
    const payload = {
      embeds: [errorEmbed('Ocorreu um erro ao processar esta ação.')],
      ephemeral: true,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

module.exports = {
  handleInteraction,
  isIngameCustomId,
};
