const store = require('../store');

async function replaceMessage(client, { label, channelId, messageId, payload, save }) {
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch((err) => {
    console.error(`[painel] ${label}: sem acesso ao canal ${channelId} (${err.message})`);
    return null;
  });
  if (!channel) return;

  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null);
    if (existing) {
      if (existing.pinned) await existing.unpin().catch(() => {});
      await existing.delete().catch((err) => {
        console.error(`[painel] ${label}: não apaguei a mensagem antiga (${err.message})`);
      });
    }
  }

  const message = await channel.send(payload);
  save(channel, message);
  console.log(`[painel] ${label} republicado em #${channel.name}`);
}

async function safe(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[painel] ${label}: ${err.message}`);
  }
}

async function repostPanels(client) {
  const tickets = require('./tickets');
  const suggestions = require('./suggestions');
  const verification = require('./verification');
  const passlist = require('./passlist');
  const fivem = require('./fivem');
  const hierarchy = require('./hierarchy');
  const ticketRank = require('./ticket-rank');
  const data = store.load();

  await safe('Tickets', () => replaceMessage(client, {
    label: 'Tickets',
    channelId: data.tickets.panelChannelId,
    messageId: data.tickets.panelMessageId,
    payload: tickets.buildPanel(data),
    save: (channel, message) => store.update((s) => {
      s.tickets.panelChannelId = channel.id;
      s.tickets.panelMessageId = message.id;
    }),
  }));

  await safe('Rank de tickets', () => ticketRank.repost(client));
  await safe('Hierarquia', () => hierarchy.repost(client));

  await safe('FiveM', () => replaceMessage(client, {
    label: 'FiveM',
    channelId: data.fivem.channelId,
    messageId: data.fivem.messageId,
    payload: fivem.buildPanel(data),
    save: (channel, message) => store.update((s) => {
      s.fivem.channelId = channel.id;
      s.fivem.messageId = message.id;
    }),
  }));

  await safe('Sugestões', () => replaceMessage(client, {
    label: 'Sugestões',
    channelId: data.suggestions.panelChannelId,
    messageId: data.suggestions.panelMessageId,
    payload: suggestions.buildPanel(data),
    save: (channel, message) => store.update((s) => {
      s.suggestions.panelChannelId = channel.id;
      s.suggestions.panelMessageId = message.id;
    }),
  }));

  await safe('Verificação', () => replaceMessage(client, {
    label: 'Verificação',
    channelId: data.verification.panelChannelId,
    messageId: data.verification.panelMessageId,
    payload: verification.buildPanel(data),
    save: (channel, message) => store.update((s) => {
      s.verification.panelChannelId = channel.id;
      s.verification.panelMessageId = message.id;
    }),
  }));

  await safe('Passlist', () => replaceMessage(client, {
    label: 'Passlist',
    channelId: data.passlist.panelChannelId,
    messageId: data.passlist.panelMessageId,
    payload: passlist.buildPanel(data),
    save: (channel, message) => store.update((s) => {
      s.passlist.panelChannelId = channel.id;
      s.passlist.panelMessageId = message.id;
    }),
  }));

  await safe('Liberar ID', () => replaceMessage(client, {
    label: 'Liberar ID',
    channelId: data.passlist.releaseChannelId,
    messageId: data.passlist.releaseMessageId,
    payload: passlist.buildReleasePanel(data),
    save: (channel, message) => store.update((s) => {
      s.passlist.releaseChannelId = channel.id;
      s.passlist.releaseMessageId = message.id;
    }),
  }));
}

module.exports = { repostPanels };
