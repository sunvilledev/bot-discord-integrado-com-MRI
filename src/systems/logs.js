const store = require('../store');
const { success, fromTemplate } = require('../utils/embeds');
const { denyIfNotAdmin } = require('../utils/permissions');

async function setChannel(interaction, channel) {
  if (await denyIfNotAdmin(interaction)) return;
  store.update((s) => {
    s.logs.channelId = channel.id;
  });
  await interaction.reply({
    embeds: [success(`Canal de **entrada e saída** definido: ${channel}. Tickets não entram aqui.`)],
    ephemeral: true,
  });
}

async function send(guild, embed) {
  const data = store.load();
  if (!data.logs.channelId) return;
  if (data.tickets?.logChannelId && data.logs.channelId === data.tickets.logChannelId) {
    console.warn('[logs] canal de entrada/saída está igual ao de tickets — configure canais diferentes.');
  }
  const channel = await guild.channels.fetch(data.logs.channelId).catch(() => null);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function onJoin(member) {
  const created = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`;
  const embed = fromTemplate(store.load().logs.joinEmbed, {
    user: `${member}`,
    tag: member.user.tag,
    id: member.id,
    conta: created,
    membros: String(member.guild.memberCount),
  }, { timestamp: true }).setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  await send(member.guild, embed);
  try {
    require('../db').insertArchive('member_join', member.id, {
      tag: member.user.tag,
      guildId: member.guild.id,
      memberCount: member.guild.memberCount,
    });
  } catch (err) {
    console.error('[db] join', err.message);
  }
}

async function onLeave(member) {
  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => `${r}`)
    .slice(0, 20)
    .join(' ') || 'Nenhum';

  const embed = fromTemplate(store.load().logs.leaveEmbed, {
    user: `${member.user}`,
    tag: member.user.tag,
    id: member.id,
    cargos: roles,
    membros: String(member.guild.memberCount),
  }, { timestamp: true }).setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  await send(member.guild, embed);
  try {
    require('../db').insertArchive('member_leave', member.id, {
      tag: member.user.tag,
      guildId: member.guild.id,
      memberCount: member.guild.memberCount,
    });
  } catch (err) {
    console.error('[db] leave', err.message);
  }
}

module.exports = { setChannel, onJoin, onLeave };
