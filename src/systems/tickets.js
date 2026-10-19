const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  EmbedBuilder,
} = require('discord.js');
const store = require('../store');
const { fromVisual, success, error } = require('../utils/embeds');
const { denyIfNotAdmin, adminRoleId } = require('../utils/permissions');
const { colors } = require('../config');

function slug(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 16) || 'ticket';
}

function menuEmoji(value) {
  let text = String(value || '').trim();
  if (!text || /\s/u.test(text)) return undefined;
  const custom = text.match(/^<?(a)?:([A-Za-z0-9_]{2,32}):(\d{17,20})>?$/);
  if (custom) {
    return { animated: Boolean(custom[1]), name: custom[2], id: custom[3] };
  }
  text = text.replace(/\u26D4\uFE0F/g, '\u26D4');
  return text;
}

function storedEmoji(value, fallback = '🎫') {
  const parsed = menuEmoji(value);
  if (!parsed) return fallback;
  if (typeof parsed === 'string') return parsed;
  return parsed.animated ? `<a:${parsed.name}:${parsed.id}>` : `<:${parsed.name}:${parsed.id}>`;
}

function buildPanel(data = store.load()) {
  const embed = fromVisual(data.tickets.embed);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:select')
    .setPlaceholder('Selecione o tipo de ticket')
    .addOptions(
      data.tickets.categories.slice(0, 25).map((cat) => ({
        label: cat.label.slice(0, 100),
        description: (cat.description || 'Abrir ticket').slice(0, 100),
        value: cat.id,
        emoji: menuEmoji(cat.emoji),
      })),
    );

  if (!data.tickets.categories.length) {
    menu.setDisabled(true).setPlaceholder('Nenhuma categoria configurada');
  }

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

async function publishPanel(interaction, channel) {
  if (await denyIfNotAdmin(interaction)) return;
  const data = store.load();
  if (!data.tickets.categories.length) {
    await interaction.reply({
      embeds: [error('Crie ao menos uma categoria com `/ticket categoria adicionar`.')],
      ephemeral: true,
    });
    return;
  }

  const payload = buildPanel(data);
  const message = await channel.send(payload);
  store.update((s) => {
    s.tickets.panelChannelId = channel.id;
    s.tickets.panelMessageId = message.id;
  });

  await interaction.reply({
    embeds: [success(`Painel de tickets enviado em ${channel}.`)],
    ephemeral: true,
  });
}

function staffRolesForCategory(category, data = store.load()) {
  const fromCat = Array.isArray(category?.staffRoles) ? category.staffRoles : [];
  if (fromCat.length) return [...new Set([adminRoleId, ...fromCat])];
  return [...new Set([adminRoleId, ...(data.tickets.staffRoles || [])])];
}

function isStaffForChannel(member, channelId, data = store.load()) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles.cache.has(adminRoleId)) return true;
  const info = data.tickets.open[channelId];
  const cat = info ? data.tickets.categories.find((c) => c.id === info.categoryId) : null;
  return staffRolesForCategory(cat, data).some((id) => member.roles.cache.has(id));
}

function ticketOverwrites(guild, userId, staffRoles) {
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  const roles = new Set([adminRoleId, ...staffRoles]);
  for (const roleId of roles) {
    if (guild.roles.cache.has(roleId)) {
      overwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }
  }
  return overwrites;
}

function isStaffMember(member, data = store.load()) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles.cache.has(adminRoleId)) return true;
  if ((data.tickets.staffRoles || []).some((id) => member.roles.cache.has(id))) return true;
  return data.tickets.categories.some((cat) => (
    Array.isArray(cat.staffRoles) && cat.staffRoles.some((id) => member.roles.cache.has(id))
  ));
}

function ticketLogChannelId() {
  return store.load().tickets.logChannelId || null;
}

async function sendTicketLog(guild, payload) {
  const channelId = ticketLogChannelId();
  if (!channelId || !guild) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  await channel.send(payload).catch((err) => console.error('[ticket-log]', err.message));
}

function fillStart(template, { user, categoria }) {
  return String(template || '')
    .replaceAll('{user}', `${user}`)
    .replaceAll('{username}', user.username)
    .replaceAll('{categoria}', categoria);
}

async function handleSelect(interaction) {
  const categoryId = interaction.values[0];
  const data = store.load();
  const category = data.tickets.categories.find((c) => c.id === categoryId);
  if (!category) {
    await interaction.reply({ embeds: [error('Categoria não encontrada.')], ephemeral: true });
    return;
  }

  const already = Object.entries(data.tickets.open).find(([, info]) => (
    info.userId === interaction.user.id && info.categoryId === categoryId
  ));
  if (already) {
    await interaction.reply({
      embeds: [error(`Você já tem um ticket aberto: <#${already[0]}>`)],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const next = store.update((s) => {
    s.tickets.counter += 1;
    return s.tickets.counter;
  });

  const parent = category.discordCategoryId || undefined;
  const name = `${String(next).padStart(3, '0')}-${slug(category.label)}-${slug(interaction.user.username)}`.slice(0, 90);

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parent || undefined,
      topic: `Ticket de ${interaction.user.tag} • ${category.label}`,
      permissionOverwrites: ticketOverwrites(
        interaction.guild,
        interaction.user.id,
        staffRolesForCategory(category, data),
      ),
    });
  } catch (err) {
    await interaction.editReply({
      embeds: [error(`Não consegui criar o canal. Verifique permissões do bot.\n\`${err.message}\``)],
    });
    return;
  }

  store.update((s) => {
    s.tickets.open[channel.id] = {
      userId: interaction.user.id,
      categoryId: category.id,
      categoryLabel: category.label,
      number: next,
      createdAt: Date.now(),
    };
  });

  try {
    require('../db').insertTicketOpen({
      number: next,
      guildId: interaction.guild.id,
      channelId: channel.id,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      categoryId: category.id,
      categoryLabel: category.label,
    });
  } catch (err) {
    console.error('[db] ticket open', err.message);
  }

  const start = fillStart(category.startMessage, {
    user: interaction.user,
    categoria: category.label,
  });

  const embed = new EmbedBuilder()
    .setColor(colors.gold)
    .setTitle(`${category.emoji || '🎫'} ${category.label}`)
    .setDescription(start)
    .setFooter({ text: `Ticket #${String(next).padStart(3, '0')} • ${interaction.user.id}` })
    .setTimestamp();

  const staffPing = staffRolesForCategory(category, data)
    .filter((id) => interaction.guild.roles.cache.has(id))
    .map((id) => `<@&${id}>`)
    .join(' ');

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Assumir').setStyle(ButtonStyle.Primary).setEmoji('✋'),
    new ButtonBuilder().setCustomId('ticket:call').setLabel('Chamar').setStyle(ButtonStyle.Secondary).setEmoji('📨'),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Fechar').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );

  await channel.send({
    content: `${interaction.user} ${staffPing}`.trim(),
    embeds: [embed],
    components: [controls],
  });

  const transcript = require('./transcript');
  await sendTicketLog(interaction.guild, {
    embeds: [transcript.openLogEmbed({
      number: next,
      categoryLabel: category.label,
      openerId: interaction.user.id,
      channelId: channel.id,
    })],
  });

  await interaction.editReply({
    embeds: [success(`Ticket criado: ${channel}`)],
  });
}

async function openCallPicker(interaction) {
  const data = store.load();
  if (!data.tickets.open[interaction.channel.id]) {
    await interaction.reply({ embeds: [error('Este canal não é um ticket.')], ephemeral: true });
    return;
  }
  if (!isStaffForChannel(interaction.member, interaction.channel.id, data)) {
    await interaction.reply({ embeds: [error('Apenas a staff desta categoria pode chamar alguém.')], ephemeral: true });
    return;
  }

  const menu = new UserSelectMenuBuilder()
    .setCustomId('ticket:pick-user')
    .setPlaceholder('Quem você quer marcar e avisar no privado?')
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    embeds: [fromVisual({
      title: '📨 Chamar no ticket',
      description: 'Escolha a pessoa. Depois você escreve a mensagem: ela é marcada aqui e recebe no privado.',
      color: colors.info,
    })],
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

async function openCallModal(interaction) {
  const data = store.load();
  if (!data.tickets.open[interaction.channel.id]) {
    await interaction.reply({ embeds: [error('Este canal não é um ticket.')], ephemeral: true });
    return;
  }
  if (!isStaffForChannel(interaction.member, interaction.channel.id, data)) {
    await interaction.reply({ embeds: [error('Apenas a staff desta categoria pode chamar alguém.')], ephemeral: true });
    return;
  }

  const user = interaction.users.first();
  if (!user || user.bot) {
    await interaction.reply({ embeds: [error('Escolha um usuário válido.')], ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket:dm-modal:${user.id}`)
    .setTitle(`Mensagem para ${user.username}`.slice(0, 45));

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('body')
        .setLabel('Mensagem (vai no ticket e no privado)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1500)
        .setPlaceholder('Explique o motivo do chamado'),
    ),
  );

  await interaction.showModal(modal);
}

async function submitCallModal(interaction) {
  const userId = interaction.customId.split(':')[2];
  const body = interaction.fields.getTextInputValue('body').trim();
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) {
    await interaction.reply({ embeds: [error('Não encontrei esse usuário.')], ephemeral: true });
    return;
  }
  await callUser(interaction, user, body);
}

async function callFromCommand(interaction) {
  const user = interaction.options.getUser('usuario', true);
  const body = interaction.options.getString('mensagem', true);
  await callUser(interaction, user, body);
}

async function callUser(interaction, user, body) {
  const data = store.load();
  if (!data.tickets.open[interaction.channel.id]) {
    await interaction.reply({ embeds: [error('Use isso dentro de um ticket.')], ephemeral: true });
    return;
  }
  if (!isStaffForChannel(interaction.member, interaction.channel.id, data)) {
    await interaction.reply({ embeds: [error('Apenas a staff desta categoria pode chamar alguém.')], ephemeral: true });
    return;
  }
  if (user.bot) {
    await interaction.reply({ embeds: [error('Não dá para chamar um bot.')], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    });
  } catch (err) {
    await interaction.editReply({
      embeds: [error(`Não consegui liberar o canal para ${user}.\n\`${err.message}\``)],
    });
    return;
  }

  const ticketEmbed = new EmbedBuilder()
    .setColor(colors.info)
    .setTitle('📨 Pessoa chamada')
    .setDescription(`${user} foi marcado por ${interaction.user}.\n\n${body}`)
    .setTimestamp();

  await interaction.channel.send({
    content: `${user}`,
    embeds: [ticketEmbed],
  });

  const jumpUrl = interaction.channel.url;
  let dmOk = true;
  try {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(colors.gold)
          .setTitle('Sunville • Você foi chamado em um ticket')
          .setDescription(body)
          .addFields(
            { name: 'Staff', value: `${interaction.user}`, inline: true },
            { name: 'Servidor', value: interaction.guild.name, inline: true },
            { name: 'Ticket', value: `${interaction.channel}`, inline: false },
          )
          .setTimestamp(),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir ticket').setURL(jumpUrl),
        ),
      ],
    });
  } catch {
    dmOk = false;
  }

  await interaction.editReply({
    embeds: [success(
      dmOk
        ? `${user} foi marcado no ticket e recebeu a mensagem no privado.`
        : `${user} foi marcado no ticket, mas o privado está fechado. Aviso ficou só no canal.`,
    )],
  });
}

async function handleClaim(interaction) {
  const member = interaction.member;
  const data = store.load();
  if (!isStaffForChannel(member, interaction.channel.id, data)) {
    await interaction.reply({ embeds: [error('Apenas a staff desta categoria pode assumir.')], ephemeral: true });
    return;
  }

  const info = data.tickets.open[interaction.channel.id];
  if (!info) {
    await interaction.reply({ embeds: [error('Este canal não é um ticket.')], ephemeral: true });
    return;
  }

  store.update((s) => {
    const open = s.tickets.open[interaction.channel.id];
    if (!open) return;
    open.claimedBy = interaction.user.id;
    open.claimedAt = Date.now();
  });

  try {
    await require('./ticket-rank').recordClaim(interaction.client, {
      userId: interaction.user.id,
      ticketChannelId: interaction.channel.id,
      ticketNumber: info.number,
    });
  } catch (err) {
    console.error('[ticket-rank] claim', err.message);
  }

  const embed = new EmbedBuilder()
    .setColor(colors.info)
    .setDescription(`✋ ${interaction.user} assumiu este ticket.`);
  await interaction.reply({ embeds: [embed] });
}

function resolveStaffToRate(info, closerId, channelId) {
  const openerId = String(info.userId || '');
  const claimed = info.claimedBy ? String(info.claimedBy) : '';
  if (claimed && claimed !== openerId) return claimed;
  const closer = closerId ? String(closerId) : '';
  if (closer && closer !== openerId) return closer;
  try {
    const fromDb = require('../db').getClaimByChannel(channelId);
    if (fromDb && fromDb !== openerId) return fromDb;
  } catch {
    /* sem banco ainda */
  }
  return null;
}

async function sendRatingDm(opener, number, staffId) {
  if (!staffId) return;
  const { ratingButtons } = require('./ratings');
  await opener.send({
    embeds: [fromVisual({
      title: '⭐ Avalie o atendimento',
      description:
        `Como foi o atendimento de <@${staffId}> no ticket **#${String(number).padStart(3, '0')}**?\n\n` +
        'Clique em uma nota de **1** a **5**.',
      color: colors.gold,
      footer: 'Sunville Roleplay • Avaliação de ticket',
    })],
    components: [ratingButtons(number, staffId)],
  });
}

async function closeTicket(interaction) {
  const data = store.load();
  const info = data.tickets.open[interaction.channel.id];
  if (!info) {
    await interaction.reply({ embeds: [error('Este canal não é um ticket.')], ephemeral: true });
    return;
  }

  const isOwner = info.userId === interaction.user.id;
  const member = interaction.member;

  if (!isOwner && !isStaffForChannel(member, interaction.channel.id, data)) {
    await interaction.reply({ embeds: [error('Você não pode fechar este ticket.')], ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const transcript = require('./transcript');
  const db = require('../db');

  const category = data.tickets.categories.find((c) => c.id === info.categoryId);
  const number = info.number || data.tickets.counter || 0;
  const categoryLabel = info.categoryLabel || category?.label || 'Ticket';

  let messages = [];
  try {
    messages = await transcript.fetchAllMessages(interaction.channel);
  } catch (err) {
    console.error('[transcript]', err.message);
  }

  const opener = await interaction.client.users.fetch(info.userId).catch(() => null);
  const text = transcript.buildTranscriptText({
    number,
    categoryLabel,
    openerTag: opener?.tag,
    openerId: info.userId,
    closerTag: interaction.user.tag,
    messages,
  });

  try {
    db.closeTicketRecord({
      channelId: interaction.channel.id,
      closedBy: interaction.user.id,
      closedByTag: interaction.user.tag,
      transcript: text,
      messageCount: messages.length,
    });
    db.insertArchive('ticket_close', info.userId, {
      number,
      categoryLabel,
      closedBy: interaction.user.id,
      channelId: interaction.channel.id,
      messageCount: messages.length,
    });
  } catch (err) {
    console.error('[db] ticket close', err.message);
  }

  const file = transcript.transcriptAttachment(text, number);
  const logPayload = {
    embeds: [transcript.logEmbed({
      number,
      categoryLabel,
      openerId: info.userId,
      closerId: interaction.user.id,
      openedAt: info.createdAt,
      messageCount: messages.length,
    })],
    files: [transcript.transcriptAttachment(text, number)],
  };

  await sendTicketLog(interaction.guild, logPayload);

  const staffToRate = resolveStaffToRate(info, interaction.user.id, interaction.channel.id);

  let dmOk = true;
  try {
    if (opener) {
      await opener.send({
        embeds: [transcript.dmEmbed({
          number,
          categoryLabel,
          closerId: interaction.user.id,
          staffId: staffToRate,
        })],
        files: [file],
      });
    } else {
      dmOk = false;
    }
  } catch (err) {
    console.error('[ticket-dm]', err.message);
    dmOk = false;
  }

  if (opener && staffToRate) {
    try {
      await sendRatingDm(opener, number, staffToRate);
    } catch (err) {
      console.error('[ticket-rate-dm]', err.message);
    }
  }

  store.update((s) => {
    delete s.tickets.open[interaction.channel.id];
  });

  await interaction.editReply({
    embeds: [success(
      dmOk
        ? 'Ticket fechado. Transcript foi para o canal de log e para o privado de quem abriu. Este canal some em 8 segundos.'
        : 'Ticket fechado. Transcript foi salvo e enviado no log. Não consegui avisar no privado (DMs fechadas). Canal some em 8 segundos.',
    )],
  });

  setTimeout(() => {
    interaction.channel.delete('Ticket fechado').catch(() => {});
  }, 8000);
}

async function addCategory(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const label = interaction.options.getString('nome', true);
  const description = interaction.options.getString('descricao', true);
  const emoji = storedEmoji(interaction.options.getString('emoji'));
  const startMessage = interaction.options.getString('inicio', true);
  const parent = interaction.options.getChannel('categoria');

  if (store.load().tickets.categories.length >= 25) {
    await interaction.reply({
      embeds: [error('O Discord aceita no máximo 25 opções na lista.')],
      ephemeral: true,
    });
    return;
  }

  const id = `${slug(label)}-${Date.now().toString(36)}`;
  store.update((s) => {
    s.tickets.categories.push({
      id,
      label,
      description,
      emoji,
      startMessage,
      discordCategoryId: parent?.id || null,
      staffRoles: [],
    });
  });

  const editor = require('./editor');
  await editor.refreshPublished(interaction.client, 'tickets');
  await interaction.reply({
    embeds: [success(`Categoria **${label}** adicionada. O painel foi atualizado.`)],
    ephemeral: true,
  });
}

async function removeCategory(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const nome = interaction.options.getString('nome', true).toLowerCase();
  const found = store.update((s) => {
    const idx = s.tickets.categories.findIndex((c) => c.label.toLowerCase() === nome || c.id === nome);
    if (idx === -1) return null;
    const [removed] = s.tickets.categories.splice(idx, 1);
    return removed;
  });

  if (!found) {
    await interaction.reply({ embeds: [error('Categoria não encontrada.')], ephemeral: true });
    return;
  }

  const editor = require('./editor');
  await editor.refreshPublished(interaction.client, 'tickets');
  await interaction.reply({
    embeds: [success(`Categoria **${found.label}** removida.`)],
    ephemeral: true,
  });
}

async function editCategory(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const nome = interaction.options.getString('nome', true).toLowerCase();
  const description = interaction.options.getString('descricao');
  const startMessage = interaction.options.getString('inicio');
  const emoji = interaction.options.getString('emoji');
  const parent = interaction.options.getChannel('categoria');

  const found = store.update((s) => {
    const cat = s.tickets.categories.find((c) => c.label.toLowerCase() === nome || c.id === nome);
    if (!cat) return null;
    if (description) cat.description = description;
    if (startMessage) cat.startMessage = startMessage;
    if (emoji) cat.emoji = storedEmoji(emoji, cat.emoji);
    if (parent) cat.discordCategoryId = parent.id;
    return cat;
  });

  if (!found) {
    await interaction.reply({ embeds: [error('Categoria não encontrada.')], ephemeral: true });
    return;
  }

  const editor = require('./editor');
  await editor.refreshPublished(interaction.client, 'tickets');
  await interaction.reply({
    embeds: [success(`Categoria **${found.label}** atualizada.`)],
    ephemeral: true,
  });
}

async function listCategories(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const data = store.load();
  const lines = data.tickets.categories.map((c, i) => (
    `**${i + 1}.** ${c.emoji || ''} ${c.label}\n${c.description}\nCategoria Discord: ${c.discordCategoryId ? `<#${c.discordCategoryId}>` : 'não definida'}`
  ));
  await interaction.reply({
    embeds: [fromVisual({
      title: 'Categorias de ticket',
      description: lines.join('\n\n') || 'Nenhuma categoria.',
      color: colors.gold,
    })],
    ephemeral: true,
  });
}

async function addStaffRole(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const role = interaction.options.getRole('cargo', true);
  store.update((s) => {
    if (!s.tickets.staffRoles.includes(role.id)) s.tickets.staffRoles.push(role.id);
  });
  await interaction.reply({
    embeds: [success(`${role} agora vê os tickets.`)],
    ephemeral: true,
  });
}

async function removeStaffRole(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const role = interaction.options.getRole('cargo', true);
  store.update((s) => {
    s.tickets.staffRoles = s.tickets.staffRoles.filter((id) => id !== role.id);
  });
  await interaction.reply({
    embeds: [success(`${role} removido da staff de tickets.`)],
    ephemeral: true,
  });
}

module.exports = {
  menuEmoji,
  storedEmoji,
  buildPanel,
  publishPanel,
  handleSelect,
  handleClaim,
  openCallPicker,
  openCallModal,
  submitCallModal,
  callFromCommand,
  closeTicket,
  addCategory,
  editCategory,
  removeCategory,
  listCategories,
  addStaffRole,
  removeStaffRole,
};
