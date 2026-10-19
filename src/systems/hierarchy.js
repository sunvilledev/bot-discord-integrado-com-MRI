const { EmbedBuilder } = require('discord.js');
const store = require('../store');
const { fromVisual, success, error } = require('../utils/embeds');
const { denyIfNotAdmin } = require('../utils/permissions');
const { colors } = require('../config');

function buildBody(guild, roleIds) {
  const blocks = [];
  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      blocks.push(`Cargo não encontrado (\`${roleId}\`)\nNinguém no momento`);
      continue;
    }
    const members = role.members
      .filter((m) => !m.user.bot)
      .map((m) => `• ${m}`)
      .join('\n');
    blocks.push(members ? `${role}\n${members}` : `${role}\nNinguém no momento`);
  }
  return blocks.join('\n\n');
}

function splitDescription(text) {
  if (text.length <= 4096) return [text];
  const parts = [];
  const chunks = text.split('\n\n');
  let current = '';
  for (const chunk of chunks) {
    const next = current ? `${current}\n\n${chunk}` : chunk;
    if (next.length > 4096) {
      if (current) parts.push(current);
      current = chunk.slice(0, 4096);
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts.length ? parts : ['Hierarquia vazia.'];
}

function buildEmbeds(guild, data) {
  const body = buildBody(guild, data.hierarchy.roles);
  const parts = splitDescription(body || 'Nenhum cargo de staff configurado.\nUse `/hierarquia cargo adicionar`.');
  return parts.map((description, index) => {
    const visual = { ...data.hierarchy.embed };
    if (index > 0) visual.title = `${visual.title} • ${index + 1}`;
    visual.description = description;
    return fromVisual(visual, { timestamp: new Date() });
  });
}

async function refreshMessage(client) {
  const data = store.load();
  if (!data.hierarchy.channelId || !data.hierarchy.messageId) return false;

  const channel = await client.channels.fetch(data.hierarchy.channelId).catch(() => null);
  if (!channel || !channel.guild) return false;

  await channel.guild.members.fetch().catch(() => {});
  const message = await channel.messages.fetch(data.hierarchy.messageId).catch(() => null);
  if (!message) return false;

  const embeds = buildEmbeds(channel.guild, data);
  await message.edit({ embeds });
  return true;
}

async function repost(client) {
  const data = store.load();
  if (!data.hierarchy.channelId) return false;

  const channel = await client.channels.fetch(data.hierarchy.channelId).catch(() => null);
  if (!channel || !channel.guild) return false;

  await channel.guild.members.fetch().catch(() => {});
  if (data.hierarchy.messageId) {
    const existing = await channel.messages.fetch(data.hierarchy.messageId).catch(() => null);
    if (existing) await existing.delete().catch(() => {});
  }

  const embeds = buildEmbeds(channel.guild, store.load());
  const message = await channel.send({ embeds });
  store.update((s) => {
    s.hierarchy.channelId = channel.id;
    s.hierarchy.messageId = message.id;
  });
  console.log(`[painel] Hierarquia republicada em #${channel.name}`);
  return true;
}

async function publish(interaction, channel) {
  if (await denyIfNotAdmin(interaction)) return;
  await interaction.deferReply({ ephemeral: true });
  await interaction.guild.members.fetch().catch(() => {});

  const data = store.load();
  const embeds = buildEmbeds(interaction.guild, data);
  const message = await channel.send({ embeds });

  store.update((s) => {
    s.hierarchy.channelId = channel.id;
    s.hierarchy.messageId = message.id;
  });

  await interaction.editReply({
    embeds: [success(`Hierarquia publicada em ${channel}. Atualiza sozinha a cada 1 hora.`)],
  });
}

async function forceUpdate(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  await interaction.deferReply({ ephemeral: true });
  await interaction.guild.members.fetch().catch(() => {});
  const ok = await refreshMessage(interaction.client);
  await interaction.editReply({
    embeds: [ok
      ? success('Hierarquia atualizada.')
      : error('Não há um painel publicado. Use `/hierarquia enviar` primeiro.')],
  });
}

async function addRole(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const role = interaction.options.getRole('cargo', true);
  store.update((s) => {
    if (!s.hierarchy.roles.includes(role.id)) s.hierarchy.roles.push(role.id);
  });
  await refreshMessage(interaction.client);
  await interaction.reply({
    embeds: [success(`${role} adicionado na hierarquia (no final da lista).`)],
    ephemeral: true,
  });
}

async function removeRole(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const role = interaction.options.getRole('cargo', true);
  store.update((s) => {
    s.hierarchy.roles = s.hierarchy.roles.filter((id) => id !== role.id);
  });
  await refreshMessage(interaction.client);
  await interaction.reply({
    embeds: [success(`${role} removido da hierarquia.`)],
    ephemeral: true,
  });
}

async function listRoles(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const data = store.load();
  const lines = data.hierarchy.roles.map((id, i) => `**${i + 1}.** <@&${id}>`);
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(colors.gold)
      .setTitle('Ordem da hierarquia')
      .setDescription(lines.join('\n') || 'Vazia.')],
    ephemeral: true,
  });
}

function startInterval(client) {
  setInterval(() => {
    refreshMessage(client).catch((err) => {
      console.error('[hierarquia] falha ao atualizar:', err.message);
    });
  }, require('../config').hierarchyIntervalMs);
}

module.exports = {
  publish,
  repost,
  forceUpdate,
  addRole,
  removeRole,
  listRoles,
  refreshMessage,
  startInterval,
  buildEmbeds,
};
