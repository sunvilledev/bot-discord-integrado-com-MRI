const fivem = require('./client');

const REFRESH_MS = 10000;
const panelMessages = new Set();

let cache = {
  players: [],
  updatedAt: 0,
  error: null,
};

function formatPlayerList(players, limit = 25) {
  if (!players.length) {
    return 'Nenhum jogador online.';
  }

  const lines = players
    .slice(0, limit)
    .map((player) => `\`#${player.id}\` ${player.name}${player.citizenid ? ` • ${player.citizenid}` : ''}`);

  if (players.length > limit) {
    lines.push(`… e mais ${players.length - limit}`);
  }

  return lines.join('\n');
}

async function refreshPlayers() {
  try {
    const data = await fivem.getPlayers();
    cache = {
      players: data.players || [],
      updatedAt: Date.now(),
      error: null,
    };
  } catch (error) {
    cache = {
      ...cache,
      error: error.message,
      updatedAt: Date.now(),
    };
  }

  return cache;
}

function getCachedPlayers() {
  return cache;
}

function trackPanelMessage(message) {
  panelMessages.add(`${message.channelId}:${message.id}`);
}

async function refreshPanelMessages(client, buildEmbed, buildRows) {
  if (!panelMessages.size) return;

  for (const key of [...panelMessages]) {
    const [channelId, messageId] = key.split(':');
    try {
      const channel = await client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);
      await message.edit({
        embeds: [buildEmbed(cache.players)],
        components: buildRows(),
      });
    } catch {
      panelMessages.delete(key);
    }
  }
}

function startPlayerRefresh(client, { buildEmbed, buildRows }) {
  const tick = async () => {
    await refreshPlayers();
    await refreshPanelMessages(client, buildEmbed, buildRows);
  };

  tick();
  return setInterval(tick, REFRESH_MS);
}

module.exports = {
  REFRESH_MS,
  formatPlayerList,
  refreshPlayers,
  getCachedPlayers,
  trackPanelMessage,
  startPlayerRefresh,
};
