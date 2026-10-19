const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const store = require('../store');
const game = require('../game');
const { fromVisual, fromTemplate, success, error } = require('../utils/embeds');
const { denyIfNotAdmin, hasAdmin, adminRoleId } = require('../utils/permissions');
const { colors } = require('../config');

const TABLES_SQL = [
  'ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `passlist` TINYINT(1) NOT NULL DEFAULT 0',
  `CREATE TABLE IF NOT EXISTS passlist_applications (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    discord_id VARCHAR(32) NOT NULL,
    discord_tag VARCHAR(80) NULL,
    nome VARCHAR(100) NULL,
    idade VARCHAR(20) NULL,
    experiencia TEXT NULL,
    motivo TEXT NULL,
    historico TEXT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    staff_id VARCHAR(32) NULL,
    staff_tag VARCHAR(80) NULL,
    reason TEXT NULL,
    review_channel_id VARCHAR(32) NULL,
    review_message_id VARCHAR(32) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_discord_status (discord_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  'ALTER TABLE passlist_applications ADD COLUMN IF NOT EXISTS answers_json TEXT NULL',
];

let tablesReady = false;

function cfg() {
  return store.load().passlist;
}

function clip(text, max = 1024) {
  const value = String(text || '').trim() || '—';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function findUserByDiscord(discordId) {
  const rows = await game.query(
    `SELECT userId, username, passlist, discord, license, license2
     FROM users
     WHERE discord = ? OR discord = ?
     LIMIT 1`,
    [`discord:${discordId}`, String(discordId)],
  );
  return rows[0] || null;
}

function licenseVariants(raw) {
  const value = String(raw || '').trim().replace(/['"`\s]/g, '');
  if (!value) return [];
  const hash = value.replace(/^license2?:/i, '');
  return [...new Set([
    value,
    hash,
    `license:${hash}`,
    `license2:${hash}`,
    value.toLowerCase(),
    hash.toLowerCase(),
  ])].filter(Boolean);
}

async function findUserByLicense(raw) {
  const variants = licenseVariants(raw);
  if (!variants.length) return null;
  const ph = variants.map(() => '?').join(',');
  const rows = await game.query(
    `SELECT userId, username, passlist, license, license2, discord
     FROM users
     WHERE license IN (${ph}) OR license2 IN (${ph})
     LIMIT 1`,
    [...variants, ...variants],
  );
  return rows[0] || null;
}

async function ensureTables() {
  if (tablesReady) return true;
  if (!game.mysqlConfigured()) return false;
  for (const sql of TABLES_SQL) {
    await game.query(sql);
  }
  tablesReady = true;
  return true;
}

function formButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('passlist:open')
      .setLabel('Enviar formulário')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📋'),
  );
}

function releaseButtonRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('passlist:release')
      .setLabel('Liberar meu ID')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔑')
      .setDisabled(disabled),
  );
}

function staffButtons(userId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`passlist:approve:${userId}`)
      .setLabel('Aprovar')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`passlist:reject:${userId}`)
      .setLabel('Reprovar')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
      .setDisabled(disabled),
  );
}

function buildPanel(data = store.load()) {
  return {
    embeds: [fromVisual(data.passlist.embed)],
    components: [formButtonRow()],
  };
}

function buildReleasePanel(data = store.load()) {
  return {
    embeds: [fromVisual(data.passlist.releaseEmbed)],
    components: [releaseButtonRow()],
  };
}

async function sendPublicDecision(interaction, kind, user, answers, reason = '') {
  const data = cfg();
  const channelId = data.publicLogChannelId;
  if (!channelId) return;
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const visual = kind === 'approved' ? data.approvedPublicEmbed : data.rejectedPublicEmbed;
  if (!visual) return;
  await channel.send({
    embeds: [fromTemplate(visual, {
      user: `<@${user.id}>`,
      userTag: user.tag || user.username || 'Jogador',
      userId: user.id,
      staff: `<@${interaction.user.id}>`,
      staffTag: interaction.user.tag,
      staffId: interaction.user.id,
      nome: answers.nome || '—',
      idade: answers.idade || '—',
      experiencia: answers.experiencia || '—',
      interesse: answers.motivo || '—',
      historico: answers.historico || '—',
      motivo: reason || '—',
    }, { timestamp: true })],
  }).catch(() => {});
}

function questions() {
  const list = cfg().questions;
  if (Array.isArray(list)) return list;
  return store.defaults.passlist.questions;
}

function mappedAnswers(answers = {}) {
  return {
    nome: answers.nome || '—',
    idade: answers.idade || '—',
    experiencia: answers.experiencia || '—',
    motivo: answers.motivo || '—',
    historico: answers.historico || '—',
    ...answers,
  };
}

function answersFromApp(app) {
  if (app?.answers_json) {
    try {
      const parsed = JSON.parse(app.answers_json);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* usa as colunas antigas */
    }
  }
  return {
    nome: app.nome,
    idade: app.idade,
    experiencia: app.experiencia,
    motivo: app.motivo,
    historico: app.historico,
  };
}

function interviewSlug(name) {
  return String(name || 'jogador')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20) || 'jogador';
}

function getInterview(userId) {
  return (cfg().interviews || {})[userId] || null;
}

function setInterview(userId, session) {
  store.update((s) => {
    if (!s.passlist.interviews) s.passlist.interviews = {};
    if (session) s.passlist.interviews[userId] = session;
    else delete s.passlist.interviews[userId];
  });
}

async function ensureInterviewCategory(guild) {
  const currentId = cfg().interviewCategoryId;
  if (currentId) {
    const existing = await guild.channels.fetch(currentId).catch(() => null);
    if (existing) return existing;
  }
  const created = await guild.channels.create({
    name: 'PASSLIST • ENTREVISTAS',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      botOverwrite(guild),
    ],
    reason: 'Categoria das entrevistas da passlist',
  });
  store.update((s) => {
    s.passlist.interviewCategoryId = created.id;
  });
  return created;
}

function questionPayload(question, index, total) {
  return {
    embeds: [fromVisual({
      title: `Pergunta ${index + 1}/${total}`,
      description: question.prompt,
      color: colors.gold,
      footer: 'Responda neste canal • pergunta e resposta somem em seguida',
    })],
  };
}

async function askQuestion(channel, question, index, total) {
  return channel.send(questionPayload(question, index, total));
}

async function deleteQuiet(channel, messageId) {
  if (!channel || !messageId) return;
  await channel.messages.delete(messageId).catch(() => {});
}

async function finishInterview(channel, session, member, user) {
  const result = await submitApplication({
    client: channel.client,
    member,
    user,
    answers: session.answers || {},
  });
  await channel.send({
    embeds: [result.ok
      ? success(`${result.warning || 'Formulário enviado para a staff. Você recebeu o cargo de **em análise**.'}\n\nEste canal será apagado em **30 segundos**.`)
      : error(result.message || 'Não consegui enviar o formulário.')],
  }).catch(() => {});
  if (!result.ok) {
    setInterview(user.id, { ...session, closing: false });
    return;
  }
  setTimeout(() => {
    setInterview(user.id, null);
    channel.delete('Passlist concluída').catch(() => {});
  }, 30000);
}

async function submitApplication({ client, member, user, answers }) {
  const data = cfg();
  const mapped = mappedAnswers(answers);
  try {
    await ensureTables();
  } catch (err) {
    return { ok: false, message: `MySQL: ${err.message}` };
  }
  const staffChannel = await client.channels.fetch(data.staffChannelId).catch(() => null);
  if (!staffChannel) return { ok: false, message: 'Canal da staff não encontrado. Avise a administração.' };

  const pending = await game.query(
    "SELECT id FROM passlist_applications WHERE discord_id = ? AND status = 'pending' LIMIT 1",
    [user.id],
  );
  if (pending.length) return { ok: false, message: 'Você já tem um formulário em análise.' };

  const reviewMessage = await staffChannel.send({
    embeds: [applicationEmbed(user, answers, 'pending')],
    components: [staffButtons(user.id)],
  });

  const values = [
    user.id,
    user.tag,
    mapped.nome === '—' ? '' : mapped.nome,
    mapped.idade === '—' ? '' : mapped.idade,
    mapped.experiencia === '—' ? '' : mapped.experiencia,
    mapped.motivo === '—' ? '' : mapped.motivo,
    mapped.historico === '—' ? '' : mapped.historico,
    staffChannel.id,
    reviewMessage.id,
    JSON.stringify(answers),
  ];
  try {
    await game.query(
      `INSERT INTO passlist_applications
        (discord_id, discord_tag, nome, idade, experiencia, motivo, historico, status, review_channel_id, review_message_id, answers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      values,
    );
  } catch {
    await game.query(
      `INSERT INTO passlist_applications
        (discord_id, discord_tag, nome, idade, experiencia, motivo, historico, status, review_channel_id, review_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      values.slice(0, 9),
    );
  }

  try {
    await addRoleSafe(member, data.pendingRoleId, 'Formulário de passlist enviado');
  } catch (err) {
    return { ok: true, warning: `Formulário enviado, mas não consegui entregar o cargo. Suba o cargo do bot.\n\`${err.message}\`` };
  }
  return { ok: true };
}

async function startInterview(interaction) {
  const list = questions();
  if (!list.length) {
    await interaction.reply({
      embeds: [error('Nenhuma pergunta configurada. A staff precisa adicionar perguntas no `/configurar`.')],
      ephemeral: true,
    });
    return;
  }

  const existing = getInterview(interaction.user.id);
  if (existing?.channelId && !existing.closing) {
    const open = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
    if (open) {
      await interaction.reply({
        embeds: [success(`Continue a passlist em ${open}.`)],
        ephemeral: true,
      });
      return;
    }
    setInterview(interaction.user.id, null);
  }

  await interaction.deferReply({ ephemeral: true });
  const category = await ensureInterviewCategory(interaction.guild);
  const channel = await interaction.guild.channels.create({
    name: `passlist-${interviewSlug(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `Entrevista de ${interaction.user.tag} (${interaction.user.id})`,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      botOverwrite(interaction.guild),
    ],
    reason: 'Entrevista da passlist',
  });

  const welcome = await channel.send({
    content: `${interaction.user}`,
    embeds: [fromVisual({
      title: '📋 Entrevista da passlist',
      description:
        `Olá ${interaction.user}! Vou fazer **${list.length}** pergunta${list.length === 1 ? '' : 's'}.\n\n` +
        'Responda **uma de cada vez** neste canal.\n' +
        'Assim que você responder, a pergunta e a sua mensagem somem para manter o chat limpo.\n' +
        'No fim, o canal é apagado em 30 segundos.',
      color: colors.gold,
      footer: 'Somente você e o bot veem este canal',
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('passlist:interview-cancel')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  });

  const questionMessage = await askQuestion(channel, list[0], 0, list.length);
  setInterview(interaction.user.id, {
    channelId: channel.id,
    index: 0,
    answers: {},
    questionMessageId: questionMessage.id,
    welcomeMessageId: welcome.id,
    closing: false,
  });

  await interaction.editReply({
    embeds: [success(`Canal privado criado: ${channel}\nResponda as perguntas lá.`)],
  });
}

async function cancelInterview(interaction) {
  const session = getInterview(interaction.user.id);
  if (!session || session.channelId !== interaction.channelId) {
    await interaction.reply({ embeds: [error('Esta entrevista não é sua.')], ephemeral: true });
    return;
  }
  setInterview(interaction.user.id, null);
  await interaction.reply({ embeds: [success('Entrevista cancelada. Este canal será apagado.')], ephemeral: true });
  await interaction.channel.delete('Passlist cancelada').catch(() => {});
}

async function onMessage(message) {
  if (!message.guild || message.author?.bot) return;
  const session = getInterview(message.author.id);
  if (!session || session.channelId !== message.channel.id || session.closing) return;

  const list = questions();
  const current = list[session.index];
  if (!current) return;

  const text = String(message.content || '').trim();
  await message.delete().catch(() => {});
  if (!text) {
    const warn = await message.channel.send({ embeds: [error('Escreva uma resposta.')] }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 4000);
    return;
  }

  await deleteQuiet(message.channel, session.questionMessageId);

  const answers = { ...(session.answers || {}), [current.id]: text.slice(0, 1024) };
  const nextIndex = session.index + 1;
  if (nextIndex >= list.length) {
    const closing = {
      ...session,
      answers,
      index: nextIndex,
      questionMessageId: null,
      closing: true,
    };
    setInterview(message.author.id, closing);
    await deleteQuiet(message.channel, session.welcomeMessageId);
    await finishInterview(message.channel, closing, message.member, message.author);
    return;
  }

  const questionMessage = await askQuestion(message.channel, list[nextIndex], nextIndex, list.length);
  setInterview(message.author.id, {
    ...session,
    answers,
    index: nextIndex,
    questionMessageId: questionMessage.id,
  });
}

function applicationEmbed(user, answers, status = 'pending', extra = {}) {
  const colorsByStatus = {
    pending: colors.gold,
    approved: colors.success,
    rejected: colors.error,
  };
  const titles = {
    pending: '📥 Nova solicitação de passlist',
    approved: '✅ Passlist aprovada',
    rejected: '❌ Passlist reprovada',
  };
  const embed = new EmbedBuilder()
    .setColor(colorsByStatus[status] || colors.gold)
    .setTitle(titles[status] || titles.pending)
    .setAuthor({
      name: user.tag || user.username || 'Jogador',
      iconURL: user.displayAvatarURL?.({ size: 128 }) || undefined,
    })
    .setFooter({ text: `Discord ID • ${user.id}` })
    .setTimestamp();

  const fields = [{ name: 'Jogador', value: `${user} \`${user.id}\``, inline: false }];
  const list = questions();
  if (list.length) {
    for (const question of list.slice(0, 20)) {
      fields.push({
        name: String(question.prompt || question.id).slice(0, 256),
        value: clip(answers[question.id], 1024),
        inline: question.id === 'idade',
      });
    }
  } else {
    fields.push(
      { name: 'Nome IC', value: clip(answers.nome, 256), inline: true },
      { name: 'Idade', value: clip(answers.idade, 64), inline: true },
      { name: 'Experiência em RP', value: clip(answers.experiencia), inline: false },
      { name: 'Por que a Sunville', value: clip(answers.motivo), inline: false },
      { name: 'Histórico / bans', value: clip(answers.historico), inline: false },
    );
  }
  if (extra.staff) fields.push({ name: 'Staff', value: extra.staff, inline: true });
  if (extra.reason) fields.push({ name: 'Motivo', value: clip(extra.reason), inline: false });
  embed.addFields(fields.slice(0, 25));
  return embed;
}

async function addRoleSafe(member, roleId, reason) {
  if (!member || !roleId) return;
  if (member.roles.cache.has(roleId)) return;
  await member.roles.add(roleId, reason);
}

async function removeRoleSafe(member, roleId, reason) {
  if (!member || !roleId) return;
  if (!member.roles.cache.has(roleId)) return;
  await member.roles.remove(roleId, reason);
}

async function dmUser(user, embed) {
  try {
    await user.send({ embeds: [embed] });
  } catch {
    // DM fechado — ignora
  }
}

async function publishForm(interaction, channel) {
  if (await denyIfNotAdmin(interaction)) return;
  const data = store.load();
  if (!data.passlist.staffChannelId) {
    await interaction.reply({
      embeds: [error('Defina o canal da staff com `/passlist canal-staff` antes de publicar o painel.')],
      ephemeral: true,
    });
    return;
  }
  if (!data.passlist.pendingRoleId || !data.passlist.approvedRoleId) {
    await interaction.reply({
      embeds: [error('Defina os cargos com `/passlist cargos` antes de publicar o painel.')],
      ephemeral: true,
    });
    return;
  }
  const message = await channel.send(buildPanel(data));
  store.update((s) => {
    s.passlist.panelChannelId = channel.id;
    s.passlist.panelMessageId = message.id;
  });
  await interaction.reply({
    embeds: [success(`Painel do formulário publicado em ${channel}.`)],
    ephemeral: true,
  });
}

async function publishRelease(interaction, channel) {
  if (await denyIfNotAdmin(interaction)) return;
  const data = store.load();
  const message = await channel.send(buildReleasePanel(data));
  store.update((s) => {
    s.passlist.releaseChannelId = channel.id;
    s.passlist.releaseMessageId = message.id;
  });
  await interaction.reply({
    embeds: [success(`Painel de liberar ID publicado em ${channel}.`)],
    ephemeral: true,
  });
}

async function setStaffChannel(interaction, channel) {
  if (await denyIfNotAdmin(interaction)) return;
  store.update((s) => {
    s.passlist.staffChannelId = channel.id;
  });
  await interaction.reply({
    embeds: [success(`Canal da staff (aprovar/reprovar): ${channel}`)],
    ephemeral: true,
  });
}

async function setRoles(interaction, pendingRole, approvedRole) {
  if (await denyIfNotAdmin(interaction)) return;
  store.update((s) => {
    s.passlist.pendingRoleId = pendingRole.id;
    s.passlist.approvedRoleId = approvedRole.id;
  });
  await interaction.reply({
    embeds: [success(`Cargo em análise: ${pendingRole}\nCargo aprovado (acesso a liberar ID): ${approvedRole}`)],
    ephemeral: true,
  });
}

function botOverwrite(guild) {
  return {
    id: guild.members.me.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
    ],
  };
}

async function findOrCreateRole(guild, name, color, reason) {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  return guild.roles.create({ name, color, mentionable: false, reason });
}

async function setup(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels) || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.editReply({
      embeds: [error('O bot precisa das permissões **Gerenciar canais** e **Gerenciar cargos**.')],
    });
    return;
  }

  try {
    await ensureTables();
  } catch (err) {
    await interaction.editReply({
      embeds: [error(`MySQL da cidade falhou: ${err.message}\nConfira MYSQL_PORT=3306 e o usuário no .env.`)],
    });
    return;
  }

  const pendingRole = await findOrCreateRole(guild, 'WL • Em análise', 0xc9a227, 'Passlist Sunville');
  const approvedRole = await findOrCreateRole(guild, 'WL • Aprovada', 0x2ecc71, 'Passlist Sunville');

  const category = await guild.channels.create({
    name: 'PASSLIST',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.SendMessages] },
      botOverwrite(guild),
    ],
  });

  const formChannel = await guild.channels.create({
    name: 'whitelist',
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
      botOverwrite(guild),
    ],
  });

  const staffChannel = await guild.channels.create({
    name: 'whitelist-staff',
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: adminRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      botOverwrite(guild),
    ],
  });

  const interviewCategory = await guild.channels.create({
    name: 'PASSLIST • ENTREVISTAS',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      botOverwrite(guild),
    ],
  });

  const releaseChannel = await guild.channels.create({
    name: 'liberar-id',
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: approvedRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        id: adminRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      botOverwrite(guild),
    ],
  });

  const data = store.load();
  const formMsg = await formChannel.send(buildPanel(data));
  const releaseMsg = await releaseChannel.send(buildReleasePanel(data));

  store.update((s) => {
    s.passlist.pendingRoleId = pendingRole.id;
    s.passlist.approvedRoleId = approvedRole.id;
    s.passlist.panelChannelId = formChannel.id;
    s.passlist.panelMessageId = formMsg.id;
    s.passlist.staffChannelId = staffChannel.id;
    s.passlist.releaseChannelId = releaseChannel.id;
    s.passlist.releaseMessageId = releaseMsg.id;
    s.passlist.interviewCategoryId = interviewCategory.id;
  });

  await interaction.editReply({
    embeds: [success(
      'Passlist criada.\n\n' +
      `Categoria: ${category}\n` +
      `Formulário: ${formChannel}\n` +
      `Staff: ${staffChannel}\n` +
      `Liberar ID: ${releaseChannel}\n` +
      `Em análise: ${pendingRole}\n` +
      `Aprovado: ${approvedRole}\n\n` +
      'O canal **liberar-id** só aparece para quem a staff aprovar.',
    )],
  });
}

function formModal() {
  const modal = new ModalBuilder()
    .setCustomId('passlist:form')
    .setTitle('Formulário da passlist');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do personagem (IC)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
        .setPlaceholder('Ex: John Miller'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('idade')
        .setLabel('Idade real')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(8)
        .setPlaceholder('Ex: 21'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('experiencia')
        .setLabel('Há quanto tempo joga RP?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(800)
        .setPlaceholder('Conte sua experiência em roleplay'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Por que quer jogar na Sunville?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(800)
        .setPlaceholder('O que te chamou atenção na cidade'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('historico')
        .setLabel('Já foi banido em outro servidor?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(800)
        .setPlaceholder('Se sim, explique. Se não, escreva Não'),
    ),
  );
  return modal;
}

function releaseModal() {
  const modal = new ModalBuilder()
    .setCustomId('passlist:release-form')
    .setTitle('Liberar pela license');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('license')
        .setLabel('License do FiveM (tela de kick)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(8)
        .setMaxLength(80)
        .setPlaceholder('license2:xxxxxxxx ou o hash'),
    ),
  );
  return modal;
}

function rejectModal(userId) {
  const modal = new ModalBuilder()
    .setCustomId(`passlist:reject-form:${userId}`)
    .setTitle('Reprovar passlist');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Motivo da reprovação')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(800)
        .setPlaceholder('Explique o motivo. O jogador recebe isso no privado.'),
    ),
  );
  return modal;
}

async function openForm(interaction) {
  const data = cfg();
  if (!data.staffChannelId || !data.pendingRoleId || !data.approvedRoleId) {
    await interaction.reply({
      embeds: [error('A passlist ainda não foi configurada. Peça para a staff usar `/passlist setup`.')],
      ephemeral: true,
    });
    return;
  }

  if (interaction.member.roles.cache.has(data.approvedRoleId)) {
    await interaction.reply({
      embeds: [success('Sua passlist já foi aprovada. Vá no canal de **liberar ID** para entrar no FiveM.')],
      ephemeral: true,
    });
    return;
  }

  try {
    await ensureTables();
    const listed = await findUserByDiscord(interaction.user.id);
    if (userReleased(listed)) {
      await interaction.reply({
        embeds: [success(`Sua conta já está liberada.\n${describeUser(listed)}\nPode entrar no FiveM.`)],
        ephemeral: true,
      });
      return;
    }
    const pending = await game.query(
      "SELECT id FROM passlist_applications WHERE discord_id = ? AND status = 'pending' LIMIT 1",
      [interaction.user.id],
    );
    if (pending.length) {
      await interaction.reply({
        embeds: [error('Você já tem um formulário em análise. Aguarde a staff.')],
        ephemeral: true,
      });
      return;
    }
  } catch (err) {
    await interaction.reply({
      embeds: [error(`Não consegui consultar o banco: ${err.message}`)],
      ephemeral: true,
    });
    return;
  }

  return startInterview(interaction);
}

async function submitForm(interaction) {
  const answers = {
    nome: interaction.fields.getTextInputValue('nome').trim(),
    idade: interaction.fields.getTextInputValue('idade').trim(),
    experiencia: interaction.fields.getTextInputValue('experiencia').trim(),
    motivo: interaction.fields.getTextInputValue('motivo').trim(),
    historico: interaction.fields.getTextInputValue('historico').trim(),
  };

  await interaction.deferReply({ ephemeral: true });
  const result = await submitApplication({
    client: interaction.client,
    member: interaction.member,
    user: interaction.user,
    answers,
  });
  await interaction.editReply({
    embeds: [result.ok
      ? success(result.warning || 'Formulário enviado. Você recebeu o cargo de **em análise**. Aguarde a staff.')
      : error(result.message)],
  });
}

async function releaseUserByLicense(raw) {
  const user = await findUserByLicense(raw);
  if (!user) {
    return {
      ok: false,
      message: 'Não achei essa **license** na tabela **users**.\nA pessoa precisa tentar conectar no FiveM uma vez (gera a conta). Depois cole a license da tela de kick.',
    };
  }
  if (userReleased(user)) {
    return { ok: true, already: true, user };
  }
  await game.query('UPDATE users SET passlist = 1 WHERE userId = ?', [user.userId]);
  return { ok: true, user };
}

function describeUser(row) {
  if (!row) return '';
  const lic = row.license2 || row.license || '—';
  return `User ID: \`${row.userId}\`\nLicense: \`${lic}\``;
}

function userReleased(row) {
  return row && (row.passlist === 1 || row.passlist === '1' || row.passlist === true);
}

async function releaseUserByDiscord(discordId) {
  const user = await findUserByDiscord(discordId);
  if (!user) {
    return {
      ok: false,
      missing: true,
      message: 'Não achei essa pessoa na tabela **users**.\nPeça para ela tentar conectar no FiveM uma vez (vai recusar). Depois libere de novo.',
    };
  }
  if (userReleased(user)) {
    return { ok: true, already: true, user };
  }
  await game.query('UPDATE users SET passlist = 1 WHERE userId = ?', [user.userId]);
  return { ok: true, user };
}

async function openRelease(interaction) {
  const data = cfg();
  if (!data.approvedRoleId) {
    await interaction.reply({
      embeds: [error('A passlist ainda não foi configurada.')],
      ephemeral: true,
    });
    return;
  }

  if (!hasAdmin(interaction.member) && !interaction.member.roles.cache.has(data.approvedRoleId)) {
    await interaction.reply({
      embeds: [error('Só quem teve a passlist **aprovada** pode liberar o ID.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.showModal(releaseModal());
}

async function submitRelease(interaction) {
  const license = interaction.fields.getTextInputValue('license').trim();
  await interaction.deferReply({ ephemeral: true });
  try {
    await ensureTables();
    let result = await releaseUserByLicense(license);
    if (!result.ok) {
      result = await releaseUserByDiscord(interaction.user.id);
    }
    if (!result.ok) {
      await interaction.editReply({ embeds: [error(result.message)] });
      return;
    }
    if (result.already) {
      await interaction.editReply({
        embeds: [success(`Já estava liberado.\n${describeUser(result.user)}`)],
      });
      return;
    }
    await interaction.editReply({
      embeds: [success(`Conta liberada na tabela **users**.\n${describeUser(result.user)}\nAgora você pode entrar no FiveM.`)],
    });
  } catch (err) {
    await interaction.editReply({ embeds: [error(`Não consegui gravar: ${err.message}`)] });
  }
}

async function fetchApplication(userId) {
  const rows = await game.query(
    `SELECT * FROM passlist_applications
     WHERE discord_id = ? AND status = 'pending'
     ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

async function approve(interaction, userId) {
  if (!hasAdmin(interaction.member)) {
    await interaction.reply({
      embeds: [error('Só a staff pode aprovar.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();
  const data = cfg();

  try {
    await ensureTables();
  } catch (err) {
    await interaction.followUp({ embeds: [error(`MySQL: ${err.message}`)], ephemeral: true });
    return;
  }

  const app = await fetchApplication(userId);
  if (!app) {
    await interaction.followUp({ embeds: [error('Não achei um formulário pendente deste jogador.')], ephemeral: true });
    return;
  }

  await game.query(
    `UPDATE passlist_applications
     SET status = 'approved', staff_id = ?, staff_tag = ?, reason = NULL
     WHERE id = ?`,
    [interaction.user.id, interaction.user.tag, app.id],
  );

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (member) {
    try {
      await removeRoleSafe(member, data.pendingRoleId, 'Passlist aprovada');
      await addRoleSafe(member, data.approvedRoleId, 'Passlist aprovada');
    } catch (err) {
      await interaction.followUp({
        embeds: [error(`Aprovado no banco, mas falhou o cargo: ${err.message}`)],
        ephemeral: true,
      });
    }
  }

  const answers = answersFromApp(app);
  const user = member?.user || await interaction.client.users.fetch(userId).catch(() => ({ id: userId, tag: app.discord_tag, toString: () => `<@${userId}>` }));
  const embed = applicationEmbed(user, answers, 'approved', {
    staff: `${interaction.user} \`${interaction.user.id}\``,
  });

  await interaction.message.edit({ embeds: [embed], components: [staffButtons(userId, true)] });
  await sendPublicDecision(interaction, 'approved', user, answers);

  await dmUser(user, fromVisual({
    title: '✅ Passlist aprovada — Sunville',
    description:
      'Sua solicitação foi **aprovada**.\n\n' +
      'Você recebeu o cargo que libera o canal **liberar-id**.\n' +
      'Entre nesse canal e clique em **Liberar meu ID**.\n' +
      'Cole a **license** que aparece na tela de kick do FiveM.\n\n' +
      'A staff também pode te liberar marcando você ou colando a license: `/passlist add`.',
    color: colors.success,
    footer: 'Sunville Roleplay',
  }));
}

async function startReject(interaction, userId) {
  if (!hasAdmin(interaction.member)) {
    await interaction.reply({
      embeds: [error('Só a staff pode reprovar.')],
      ephemeral: true,
    });
    return;
  }
  await interaction.showModal(rejectModal(userId));
}

async function submitReject(interaction, userId) {
  if (!hasAdmin(interaction.member)) {
    await interaction.reply({
      embeds: [error('Só a staff pode reprovar.')],
      ephemeral: true,
    });
    return;
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  await interaction.deferReply({ ephemeral: true });
  const data = cfg();

  try {
    await ensureTables();
  } catch (err) {
    await interaction.editReply({ embeds: [error(`MySQL: ${err.message}`)] });
    return;
  }

  const app = await fetchApplication(userId);
  if (!app) {
    await interaction.editReply({ embeds: [error('Não achei um formulário pendente deste jogador.')] });
    return;
  }

  await game.query(
    `UPDATE passlist_applications
     SET status = 'rejected', staff_id = ?, staff_tag = ?, reason = ?
     WHERE id = ?`,
    [interaction.user.id, interaction.user.tag, reason, app.id],
  );

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (member) {
    await removeRoleSafe(member, data.pendingRoleId, 'Passlist reprovada').catch(() => {});
    await removeRoleSafe(member, data.approvedRoleId, 'Passlist reprovada').catch(() => {});
  }

  const answers = answersFromApp(app);
  const user = member?.user || await interaction.client.users.fetch(userId).catch(() => ({ id: userId, tag: app.discord_tag, toString: () => `<@${userId}>` }));
  const embed = applicationEmbed(user, answers, 'rejected', {
    staff: `${interaction.user} \`${interaction.user.id}\``,
    reason,
  });

  const channel = interaction.channel
    || (app.review_channel_id ? await interaction.client.channels.fetch(app.review_channel_id).catch(() => null) : null);
  if (channel && app.review_message_id) {
    const msg = await channel.messages.fetch(app.review_message_id).catch(() => null);
    if (msg) await msg.edit({ embeds: [embed], components: [staffButtons(userId, true)] });
  }

  await sendPublicDecision(interaction, 'rejected', user, answers, reason);

  await dmUser(user, fromVisual({
    title: '❌ Passlist reprovada — Sunville',
    description:
      'Sua solicitação **não foi aprovada**.\n\n' +
      `**Motivo:** ${clip(reason, 900)}\n\n` +
      'Você pode enviar um novo formulário depois de corrigir o que foi apontado.',
    color: colors.error,
    footer: 'Sunville Roleplay',
  }));

  await interaction.editReply({ embeds: [success(`Reprovado <@${userId}>. O jogador foi avisado no privado.`)] });
}

async function addPlayer(interaction, user, license) {
  if (await denyIfNotAdmin(interaction)) return;
  if (!user && !license) {
    await interaction.reply({
      embeds: [error('Marque um **usuário** ou cole a **license** da tela de kick.')],
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    await ensureTables();
    let result = null;
    if (user) result = await releaseUserByDiscord(user.id);
    if ((!result || !result.ok) && license) result = await releaseUserByLicense(license);
    if (!result || !result.ok) {
      await interaction.editReply({
        embeds: [error(result?.message || 'Não achei essa conta na tabela **users**.')],
      });
      return;
    }

    const data = cfg();
    const member = user ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
    if (member && data.approvedRoleId) {
      await addRoleSafe(member, data.approvedRoleId, 'Passlist manual').catch(() => {});
      await removeRoleSafe(member, data.pendingRoleId, 'Passlist manual').catch(() => {});
    }

    const who = user ? `${user}\n` : '';
    if (result.already) {
      await interaction.editReply({
        embeds: [success(`${who}Já estava liberado.\n${describeUser(result.user)}`)],
      });
      return;
    }
    await interaction.editReply({
      embeds: [success(`${who}Liberado na tabela **users** (\`passlist = 1\`).\n${describeUser(result.user)}`)],
    });
  } catch (err) {
    await interaction.editReply({ embeds: [error(`Falha ao adicionar: ${err.message}`)] });
  }
}

async function removePlayer(interaction, user, license) {
  if (await denyIfNotAdmin(interaction)) return;
  if (!user && !license) {
    await interaction.reply({
      embeds: [error('Marque um **usuário** ou cole a **license**.')],
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    await ensureTables();
    let row = user ? await findUserByDiscord(user.id) : null;
    if (!row && license) row = await findUserByLicense(license);
    if (!row) {
      await interaction.editReply({
        embeds: [error('Não achei essa conta na tabela **users**.')],
      });
      return;
    }
    await game.query('UPDATE users SET passlist = 0 WHERE userId = ?', [row.userId]);

    const data = cfg();
    const member = user ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
    if (member) {
      await removeRoleSafe(member, data.approvedRoleId, 'Removido da passlist').catch(() => {});
      await removeRoleSafe(member, data.pendingRoleId, 'Removido da passlist').catch(() => {});
    }

    const who = user ? `${user}\n` : '';
    await interaction.editReply({
      embeds: [success(`${who}Removido da passlist.\n${describeUser(row)}`)],
    });
  } catch (err) {
    await interaction.editReply({ embeds: [error(`Falha ao remover: ${err.message}`)] });
  }
}

async function handleCommand(interaction) {
  const sub = interaction.options.getSubcommand(false);
  if (sub === 'setup') return setup(interaction);
  if (sub === 'painel') return publishForm(interaction, interaction.options.getChannel('canal', true));
  if (sub === 'liberar-painel') return publishRelease(interaction, interaction.options.getChannel('canal', true));
  if (sub === 'canal-staff') return setStaffChannel(interaction, interaction.options.getChannel('canal', true));
  if (sub === 'cargos') {
    return setRoles(
      interaction,
      interaction.options.getRole('em-analise', true),
      interaction.options.getRole('aprovado', true),
    );
  }
  if (sub === 'editar') {
    const editor = require('./editor');
    const alvo = interaction.options.getString('alvo') || 'passlist';
    return editor.openEditor(interaction, alvo, alvo === 'passlistRelease' ? 'Liberar ID' : 'Passlist');
  }
  if (sub === 'add') {
    return addPlayer(
      interaction,
      interaction.options.getUser('usuario'),
      interaction.options.getString('license'),
    );
  }
  if (sub === 'del') {
    return removePlayer(
      interaction,
      interaction.options.getUser('usuario'),
      interaction.options.getString('license'),
    );
  }
}

async function handleButton(interaction) {
  const id = interaction.customId;
  if (id === 'passlist:open') return openForm(interaction);
  if (id === 'passlist:interview-cancel') return cancelInterview(interaction);
  if (id === 'passlist:release') return openRelease(interaction);
  if (id.startsWith('passlist:approve:')) return approve(interaction, id.split(':')[2]);
  if (id.startsWith('passlist:reject:')) return startReject(interaction, id.split(':')[2]);
}

async function handleModal(interaction) {
  const id = interaction.customId;
  if (id === 'passlist:form') return submitForm(interaction);
  if (id === 'passlist:release-form') return submitRelease(interaction);
  if (id.startsWith('passlist:reject-form:')) return submitReject(interaction, id.split(':')[2]);
}

module.exports = {
  ensureTables,
  buildPanel,
  buildReleasePanel,
  publishForm,
  publishRelease,
  setStaffChannel,
  setRoles,
  setup,
  handleCommand,
  handleButton,
  handleModal,
  onMessage,
};
