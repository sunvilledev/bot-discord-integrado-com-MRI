const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const store = require('../store');
const db = require('../db');
const { colors } = require('../config');
const { fromTemplate } = require('../utils/embeds');

function ratingButtons(ticketNumber, staffId) {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((score) => new ButtonBuilder()
      .setCustomId(`ticket:rate:${ticketNumber}:${staffId}:${score}`)
      .setLabel(`${score} ⭐`)
      .setStyle(score >= 4 ? ButtonStyle.Success : score === 3 ? ButtonStyle.Secondary : ButtonStyle.Danger)),
  );
}

function parseRateId(customId) {
  if (!customId.startsWith('ticket:rate:')) return null;
  const parts = customId.split(':');
  if (parts.length < 5) return null;
  return {
    number: Number(parts[2]),
    staffId: parts[3],
    score: Number(parts[4]),
  };
}

function stars(score) {
  return `${'⭐'.repeat(score)}${'☆'.repeat(Math.max(0, 5 - score))} (${score}/5)`;
}

async function sendRatingLog(client, { number, openerId, staffId, score }) {
  const channelId = store.load().tickets.ratingChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const embed = fromTemplate(store.load().tickets.ratingLogEmbed, {
    ticket: String(number).padStart(3, '0'),
    staff: `<@${staffId}>`,
    jogador: `<@${openerId}>`,
    nota: stars(score),
  }, { timestamp: true });
  if (score >= 4) embed.setColor(colors.success);
  else if (score === 3) embed.setColor(colors.info);
  else embed.setColor(colors.error);
  if (!embed.data.fields?.length) {
    embed.addFields(
      { name: 'Staff', value: `<@${staffId}>`, inline: true },
      { name: 'Jogador', value: `<@${openerId}>`, inline: true },
      { name: 'Nota', value: stars(score), inline: false },
    );
  }
  await channel.send({ embeds: [embed] }).catch((err) => console.error('[rating-log]', err.message));
}

async function handleButton(interaction) {
  const parsed = parseRateId(interaction.customId);
  if (!parsed || !parsed.staffId || !parsed.score) {
    await interaction.reply({ content: 'Avaliação inválida.', ephemeral: true });
    return;
  }

  if (db.hasTicketRating(parsed.number, interaction.user.id)) {
    await interaction.reply({ content: 'Você já avaliou este ticket.', ephemeral: true });
    return;
  }

  const ok = db.insertTicketRating({
    ticketNumber: parsed.number,
    openerId: interaction.user.id,
    staffId: parsed.staffId,
    score: parsed.score,
  });
  if (!ok) {
    await interaction.reply({ content: 'Você já avaliou este ticket.', ephemeral: true });
    return;
  }

  await sendRatingLog(interaction.client, {
    number: parsed.number,
    openerId: interaction.user.id,
    staffId: parsed.staffId,
    score: parsed.score,
  });

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(colors.success)
        .setTitle('Obrigado pela avaliação')
        .setDescription(`Você deu **${stars(parsed.score)}** para <@${parsed.staffId}>.`),
    ],
    components: [],
  }).catch(async () => {
    await interaction.reply({
      content: `Avaliação registrada: ${stars(parsed.score)}.`,
      ephemeral: true,
    });
  });
}

module.exports = {
  ratingButtons,
  parseRateId,
  handleButton,
};
