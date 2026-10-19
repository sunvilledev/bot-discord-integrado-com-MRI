const { PermissionFlagsBits } = require('discord.js');
const { adminRoleId } = require('../config');

function hasAdmin(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.has(adminRoleId);
}

async function denyIfNotAdmin(interaction) {
  const member = interaction.member;
  if (hasAdmin(member)) return false;
  const payload = {
    content: `Apenas quem tem o cargo <@&${adminRoleId}> pode usar isso.`,
    ephemeral: true,
  };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
  return true;
}

module.exports = { hasAdmin, denyIfNotAdmin, adminRoleId };
