const { ChannelType, PermissionFlagsBits } = require('discord.js');
const store = require('../store');
const { adminRoleId } = require('../utils/permissions');

const DEFAULT_PRIVILEGED_ROLE = '';

const VOICE_ALL = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.PrioritySpeaker,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.CreateInstantInvite,
  PermissionFlagsBits.UseEmbeddedActivities,
  PermissionFlagsBits.UseSoundboard,
  PermissionFlagsBits.SendVoiceMessages,
].filter(Boolean);

function settings() {
  return store.load().calls || {};
}

function privilegedRoleId() {
  return settings().privilegedRoleId || DEFAULT_PRIVILEGED_ROLE;
}

function isCallStaff(member) {
  if (!member) return false;
  if (member.user?.bot) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles.cache.has(adminRoleId)) return true;
  const data = store.load();
  const configured = data.calls?.staffRoles || [];
  if (configured.length) {
    return configured.some((id) => member.roles.cache.has(id));
  }
  if (data.commands?.staffRoleId && member.roles.cache.has(data.commands.staffRoleId)) return true;
  if ((data.tickets?.staffRoles || []).some((id) => member.roles.cache.has(id))) return true;
  return (data.tickets?.categories || []).some((cat) => (
    Array.isArray(cat.staffRoles) && cat.staffRoles.some((id) => member.roles.cache.has(id))
  ));
}

function slugName(member) {
  const prefix = (settings().namePrefix || 'Atendimento').trim() || 'Atendimento';
  const raw = member.displayName || member.user?.username || 'staff';
  return `${prefix} ${raw}`.replace(/[^\p{L}\p{N}\s\-_']/gu, '').trim().slice(0, 100) || prefix;
}

function existingCallFor(userId) {
  const open = settings().open || {};
  return Object.entries(open).find(([, info]) => info.userId === userId)?.[0] || null;
}

async function createCall(member) {
  const cfg = settings();
  const guild = member.guild;
  const name = slugName(member);
  const privileged = privilegedRoleId();
  const overwrites = [
    {
      id: guild.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
    {
      id: guild.members.me.id,
      allow: VOICE_ALL,
    },
    {
      id: member.id,
      allow: VOICE_ALL,
    },
  ];
  if (guild.roles.cache.has(privileged)) {
    overwrites.push({ id: privileged, allow: VOICE_ALL });
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: cfg.categoryId || undefined,
    permissionOverwrites: overwrites,
    reason: `Call automática de atendimento para ${member.user.tag}`,
  });

  store.update((s) => {
    if (!s.calls.open) s.calls.open = {};
    s.calls.open[channel.id] = { userId: member.id, createdAt: Date.now() };
  });

  await member.voice.setChannel(channel).catch(() => {});
  const logId = settings().logChannelId;
  if (logId) {
    const logChannel = await guild.channels.fetch(logId).catch(() => null);
    if (logChannel) {
      const { fromTemplate } = require('../utils/embeds');
      await logChannel.send({
        embeds: [fromTemplate(store.load().calls.logEmbed, {
          user: `${member}`,
          call: `${channel}`,
        }, { timestamp: true })],
      }).catch(() => {});
    }
  }
  return channel;
}

async function deleteIfEmpty(channel) {
  if (!channel) return;
  const members = channel.members?.size ?? 0;
  if (members > 0) return;
  store.update((s) => {
    if (s.calls.open) delete s.calls.open[channel.id];
  });
  await channel.delete('Call de atendimento vazia').catch(() => {});
}

async function onVoiceStateUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const cfg = settings();
  const lobbyId = cfg.lobbyChannelId;
  const open = cfg.open || {};
  const joinedId = newState.channelId;
  const leftId = oldState.channelId;

  if (leftId && open[leftId] && leftId !== joinedId) {
    const left = oldState.channel || await oldState.guild.channels.fetch(leftId).catch(() => null);
    if (left) await deleteIfEmpty(left);
  }

  if (!lobbyId || joinedId !== lobbyId || leftId === lobbyId) return;
  if (!isCallStaff(member)) return;
  if (open[joinedId]) return;

  const existingId = existingCallFor(member.id);
  if (existingId) {
    const existing = await newState.guild.channels.fetch(existingId).catch(() => null);
    if (existing) {
      await member.voice.setChannel(existing).catch(() => {});
      return;
    }
    store.update((s) => {
      if (s.calls.open) delete s.calls.open[existingId];
    });
  }

  try {
    await createCall(member);
  } catch (err) {
    console.error('[calls] falha ao criar atendimento:', err.message);
  }
}

module.exports = {
  onVoiceStateUpdate,
  isCallStaff,
  privilegedRoleId,
  DEFAULT_PRIVILEGED_ROLE,
};
