const { discord } = require('../config');
const db = require('../db');
const { getCachedPlayers, trackPanelMessage } = require('../fivem/players');
const { buildPanelEmbed, buildPanelRows } = require('./admin');

function readPanelState() {
  return db.getPanel();
}

function writePanelState(state) {
  db.setPanel(state);
}

function getPanelChannelId() {
  return discord.panelChannelId || readPanelState().channelId || '';
}

async function ensureFixedPanel(client) {
  const channelId = getPanelChannelId();
  if (!channelId) {
    console.log('Painel in-game: defina o canal em /configurar → Painel in-game.');
    return null;
  }

  const channel = await client.channels.fetch(channelId).catch((error) => {
    console.error(
      `Painel in-game: sem acesso ao canal ${channelId} (${error.code || error.message}).`,
    );
    return null;
  });
  if (!channel) {
    return null;
  }

  const { players } = getCachedPlayers();
  const payload = {
    embeds: [buildPanelEmbed(players)],
    components: buildPanelRows(),
  };

  const state = readPanelState();
  if (state.messageId) {
    const oldChannel = state.channelId && state.channelId !== channel.id
      ? await client.channels.fetch(state.channelId).catch(() => null)
      : channel;
    const existing = oldChannel
      ? await oldChannel.messages.fetch(state.messageId).catch(() => null)
      : null;
    if (existing) {
      if (existing.pinned) await existing.unpin().catch(() => {});
      await existing.delete().catch((err) => {
        console.error(`[painel] in-game: não apaguei a mensagem antiga (${err.message}).`);
      });
    }
  }

  const message = await channel.send(payload);
  await message.pin().catch(() => {});
  writePanelState({ channelId: channel.id, messageId: message.id });
  trackPanelMessage(message);
  console.log(`Painel in-game republicado em #${channel.name}`);
  return message;
}

async function fixPanelInChannel(channel) {
  const { players } = getCachedPlayers();
  const payload = {
    embeds: [buildPanelEmbed(players)],
    components: buildPanelRows(),
  };

  const state = readPanelState();
  if (state.channelId === channel.id && state.messageId) {
    const existing = await channel.messages.fetch(state.messageId).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      trackPanelMessage(existing);
      writePanelState({ channelId: channel.id, messageId: existing.id });
      return existing;
    }
  }

  const message = await channel.send(payload);
  await message.pin().catch(() => {});
  writePanelState({ channelId: channel.id, messageId: message.id });
  trackPanelMessage(message);
  return message;
}

module.exports = {
  ensureFixedPanel,
  fixPanelInChannel,
  getPanelChannelId,
};
