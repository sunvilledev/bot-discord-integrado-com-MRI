const { discord } = require('../config');
const { getMemberActionIds } = require('../permissions/store');

function hasRole(member, roleId) {
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

function isPermissionManager(member) {
  if (!member) return false;
  if (member.permissions?.has('Administrator')) return true;
  return hasRole(member, discord.permissionManagerRoleId);
}

function isStaff(member) {
  if (!member) return false;
  if (isPermissionManager(member)) return true;
  if (hasRole(member, discord.staffRoleId)) return true;
  return getMemberActionIds(member).length > 0;
}

function canUseAction(member, actionId) {
  if (!member) return false;
  if (isPermissionManager(member)) return true;
  if (hasRole(member, discord.staffRoleId)) return true;
  return getMemberActionIds(member).includes(actionId);
}

async function deny(interaction, content) {
  const payload = { content, ephemeral: true };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else if (interaction.isRepliable()) {
    await interaction.reply(payload);
  }
}

async function denyIfNotStaff(interaction) {
  if (isStaff(interaction.member)) return false;
  await deny(interaction, 'Você não tem cargo com permissão neste painel.');
  return true;
}

async function denyIfNotManager(interaction) {
  if (isPermissionManager(interaction.member)) return false;
  await deny(interaction, 'Apenas o cargo de configuração pode gerenciar isto.');
  return true;
}

async function denyIfCannotUseAction(interaction, actionId) {
  if (canUseAction(interaction.member, actionId)) return false;
  await deny(interaction, 'Seu cargo não pode executar este comando.');
  return true;
}

module.exports = {
  isStaff,
  isPermissionManager,
  canUseAction,
  denyIfNotStaff,
  denyIfNotManager,
  denyIfCannotUseAction,
};
