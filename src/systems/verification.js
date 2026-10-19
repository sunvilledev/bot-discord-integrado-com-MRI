const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const store = require('../store');
const { fromVisual, success, error } = require('../utils/embeds');
const { denyIfNotAdmin } = require('../utils/permissions');
const { generateChallenge } = require('../utils/codes');
const { colors } = require('../config');

const sessions = new Map();

function buildPanel(data = store.load()) {
  const embed = fromVisual(data.verification.embed);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify:start')
      .setLabel('Verificar')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
  );
  return { embeds: [embed], components: [row] };
}

async function publish(interaction, channel, role) {
  if (await denyIfNotAdmin(interaction)) return;
  const data = store.load();
  const message = await channel.send(buildPanel(data));
  store.update((s) => {
    s.verification.panelChannelId = channel.id;
    s.verification.panelMessageId = message.id;
    s.verification.roleId = role.id;
  });
  await interaction.reply({
    embeds: [success(`Painel de verificação em ${channel}. Cargo liberado: ${role}`)],
    ephemeral: true,
  });
}

async function setRole(interaction, role) {
  if (await denyIfNotAdmin(interaction)) return;
  store.update((s) => {
    s.verification.roleId = role.id;
  });
  await interaction.reply({
    embeds: [success(`Cargo de verificação: ${role}`)],
    ephemeral: true,
  });
}

async function start(interaction) {
  const data = store.load();
  if (!data.verification.roleId) {
    await interaction.reply({
      embeds: [error('A verificação ainda não tem um cargo configurado.')],
      ephemeral: true,
    });
    return;
  }

  if (interaction.member.roles.cache.has(data.verification.roleId)) {
    await interaction.reply({
      embeds: [success('Você já está verificado.')],
      ephemeral: true,
    });
    return;
  }

  const challenge = generateChallenge(10);
  sessions.set(interaction.user.id, {
    correct: challenge.correct,
    expires: Date.now() + 2 * 60 * 1000,
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('verify:select')
    .setPlaceholder('Selecione o código que coincide')
    .addOptions(challenge.codes.map((code) => ({
      label: code,
      value: code,
    })));

  await interaction.reply({
    embeds: [fromVisual({
      title: '🔐 Confirme o código',
      description:
        'Esta mensagem é só sua.\n' +
        'O bot escolheu um código. Selecione **exatamente** o mesmo na lista.\n\n' +
        `Código correto:\n\`\`\`\n${challenge.correct}\n\`\`\`\n` +
        'Você tem **2 minutos**.',
      color: colors.success,
      footer: 'Se errar, clique em Verificar de novo.',
    })],
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

async function select(interaction) {
  const picked = interaction.values[0];
  const session = sessions.get(interaction.user.id);
  const data = store.load();

  if (!session || session.expires < Date.now()) {
    sessions.delete(interaction.user.id);
    await interaction.update({
      embeds: [error('O código expirou. Clique em Verificar novamente.')],
      components: [],
    });
    return;
  }

  if (picked !== session.correct) {
    sessions.delete(interaction.user.id);
    await interaction.update({
      embeds: [error(`Código incorreto. Você escolheu \`${picked}\`, o bot pediu \`${session.correct}\`.\nClique em Verificar e tente de novo.`)],
      components: [],
    });
    return;
  }

  sessions.delete(interaction.user.id);

  const role = interaction.guild.roles.cache.get(data.verification.roleId);
  if (!role) {
    await interaction.update({
      embeds: [error('O cargo de verificação não existe mais. Avise a staff.')],
      components: [],
    });
    return;
  }

  try {
    await interaction.member.roles.add(role, 'Verificação por código');
  } catch (err) {
    await interaction.update({
      embeds: [error(`Não consegui entregar o cargo. O cargo do bot precisa estar acima de ${role}.\n\`${err.message}\``)],
      components: [],
    });
    return;
  }

  await interaction.update({
    embeds: [success(`Verificado! Você recebeu ${role}.`)],
    components: [],
  });
  try {
    require('../db').insertArchive('verification', interaction.user.id, { roleId: role.id });
  } catch (err) {
    console.error('[db] verification', err.message);
  }
}

module.exports = { buildPanel, publish, setRole, start, select };
