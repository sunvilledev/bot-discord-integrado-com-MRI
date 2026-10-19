const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../store');
const { fromVisual, success, error } = require('../utils/embeds');
const { denyIfNotAdmin } = require('../utils/permissions');

function buildPanel(data = store.load()) {
  const embed = fromVisual(data.fivem.embed);
  const components = [];
  if (data.fivem.connectUrl) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Conectar no FiveM')
        .setURL(data.fivem.connectUrl)
        .setEmoji('🎮'),
    ));
  }
  return { embeds: [embed], components };
}

async function publish(interaction, channel) {
  if (await denyIfNotAdmin(interaction)) return;
  const data = store.load();
  const message = await channel.send(buildPanel(data));
  store.update((s) => {
    s.fivem.channelId = channel.id;
    s.fivem.messageId = message.id;
  });
  await interaction.reply({
    embeds: [success(`Embed de conexão enviado em ${channel}.`)],
    ephemeral: true,
  });
}

async function setConnect(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const url = interaction.options.getString('url', true).trim();
  if (!/^https?:\/\//i.test(url) && !url.startsWith('fivem://')) {
    await interaction.reply({
      embeds: [error('Use um link http(s) ou fivem://')],
      ephemeral: true,
    });
    return;
  }

  // Discord link buttons only accept http/https
  if (!/^https?:\/\//i.test(url)) {
    await interaction.reply({
      embeds: [error('O botão do Discord só aceita links http/https. Use o link cfx.re.')],
      ephemeral: true,
    });
    return;
  }

  store.update((s) => {
    s.fivem.connectUrl = url;
  });
  const editor = require('./editor');
  await editor.refreshPublished(interaction.client, 'fivem');
  await interaction.reply({
    embeds: [success('Link de conexão atualizado.')],
    ephemeral: true,
  });
}

module.exports = { buildPanel, publish, setConnect };
