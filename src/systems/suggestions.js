const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const store = require('../store');
const { fromVisual, success, error } = require('../utils/embeds');
const { denyIfNotAdmin } = require('../utils/permissions');
const { colors } = require('../config');

function buildPanel(data = store.load()) {
  const embed = fromVisual(data.suggestions.embed);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('suggest:open')
      .setLabel('Enviar sugestão')
      .setStyle(ButtonStyle.Success)
      .setEmoji('💡'),
  );
  return { embeds: [embed], components: [row] };
}

async function publish(interaction, channel, reviewChannel) {
  if (await denyIfNotAdmin(interaction)) return;
  const data = store.load();
  const message = await channel.send(buildPanel(data));
  store.update((s) => {
    s.suggestions.panelChannelId = channel.id;
    s.suggestions.panelMessageId = message.id;
    s.suggestions.reviewChannelId = reviewChannel.id;
  });
  await interaction.reply({
    embeds: [success(`Painel em ${channel}. As sugestões vão para ${reviewChannel}.`)],
    ephemeral: true,
  });
}

async function setReviewChannel(interaction, reviewChannel) {
  if (await denyIfNotAdmin(interaction)) return;
  store.update((s) => {
    s.suggestions.reviewChannelId = reviewChannel.id;
  });
  await interaction.reply({
    embeds: [success(`Canal de sugestões definido: ${reviewChannel}`)],
    ephemeral: true,
  });
}

async function openModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('suggest:modal')
    .setTitle('Nova sugestão');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Título')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setPlaceholder('Resumo da ideia'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('body')
        .setLabel('Sugestão')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1500)
        .setPlaceholder('Explique a ideia, o motivo e como ajudaria a cidade'),
    ),
  );

  await interaction.showModal(modal);
}

function voteRow(yes, no) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('suggest:vote:yes')
      .setLabel(`Aprovar (${yes})`)
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId('suggest:vote:no')
      .setLabel(`Reprovar (${no})`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
  );
}

async function submitModal(interaction) {
  const data = store.load();
  if (!data.suggestions.reviewChannelId) {
    await interaction.reply({
      embeds: [error('O canal de sugestões ainda não foi configurado.')],
      ephemeral: true,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue('title').trim();
  const body = interaction.fields.getTextInputValue('body').trim();
  const channel = await interaction.client.channels.fetch(data.suggestions.reviewChannelId).catch(() => null);
  if (!channel) {
    await interaction.reply({
      embeds: [error('Não encontrei o canal de sugestões.')],
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(colors.info)
    .setAuthor({
      name: interaction.user.tag,
      iconURL: interaction.user.displayAvatarURL({ size: 128 }),
    })
    .setTitle(title)
    .setDescription(body)
    .addFields(
      { name: 'Autor', value: `${interaction.user} \`${interaction.user.id}\``, inline: true },
      { name: 'Votos', value: '✅ 0 • ❌ 0', inline: true },
    )
    .setTimestamp();

  const message = await channel.send({
    embeds: [embed],
    components: [voteRow(0, 0)],
  });

  store.update((s) => {
    s.suggestions.votes[message.id] = { yes: [], no: [], authorId: interaction.user.id };
  });
  try {
    require('../db').insertArchive('suggestion', interaction.user.id, { title, body, messageId: message.id });
  } catch (err) {
    console.error('[db] suggestion', err.message);
  }

  await interaction.reply({
    embeds: [success(`Sugestão enviada em ${channel}. A cidade já pode votar.`)],
    ephemeral: true,
  });
}

async function handleVote(interaction) {
  const side = interaction.customId.endsWith(':yes') ? 'yes' : 'no';
  const userId = interaction.user.id;

  const record = store.update((s) => {
    if (!s.suggestions.votes[interaction.message.id]) {
      s.suggestions.votes[interaction.message.id] = { yes: [], no: [], authorId: null };
    }
    const vote = s.suggestions.votes[interaction.message.id];
    const already = vote[side].includes(userId);
    vote.yes = vote.yes.filter((id) => id !== userId);
    vote.no = vote.no.filter((id) => id !== userId);
    if (!already) vote[side].push(userId);
    return vote;
  });

  const embed = EmbedBuilder.from(interaction.message.embeds[0]);
  const fields = embed.data.fields || [];
  const nextFields = fields.filter((f) => f.name !== 'Votos');
  nextFields.push({
    name: 'Votos',
    value: `✅ ${record.yes.length} • ❌ ${record.no.length}`,
    inline: true,
  });
  embed.setFields(nextFields);

  await interaction.update({
    embeds: [embed],
    components: [voteRow(record.yes.length, record.no.length)],
  });
}

module.exports = {
  buildPanel,
  publish,
  setReviewChannel,
  openModal,
  submitModal,
  handleVote,
};
