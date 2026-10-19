const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} = require('discord.js');
const { token } = require('./config');
const store = require('./store');
const tickets = require('./systems/tickets');
const hierarchy = require('./systems/hierarchy');
const fivem = require('./systems/fivem');
const suggestions = require('./systems/suggestions');
const verification = require('./systems/verification');
const passlist = require('./systems/passlist');
const logs = require('./systems/logs');
const editor = require('./systems/editor');
const config = require('./systems/config');
const composer = require('./systems/composer');
const game = require('./game');
const { error } = require('./utils/embeds');
const { denyIfNotAdmin } = require('./utils/permissions');
const ingame = require('./ingame/handlers/interactions');
const { refreshPlayers, startPlayerRefresh } = require('./ingame/fivem/players');
const { buildPanelEmbed, buildPanelRows } = require('./ingame/panels/admin');
const { ensureFixedPanel } = require('./ingame/panels/fixed');
const { ensureTimeclock, startTimeclock } = require('./ingame/timeclock/service');
const { startBanRoleWatch, restoreBanRoleOnJoin, restoreWarnRoleOnJoin } = require('./ingame/bans/roles');
const calls = require('./systems/calls');
const antilink = require('./systems/antilink');
const ratings = require('./systems/ratings');
const { repostPanels } = require('./systems/repost-panels');
const backup = require('./systems/backup');
const rename = require('./systems/rename');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.GuildMember, Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, async (readyClient) => {
  store.load();
  try {
    const db = require('./db');
    await db.init();
    db.startPurgeInterval();
  } catch (err) {
    console.error('[db] falha ao iniciar banco:', err);
  }
  try {
    const { deploy } = require('./deploy-commands');
    await deploy();
  } catch (err) {
    console.error('[slash] falha ao registrar comandos:', err);
  }
  try {
    await game.initMysql();
    rename.start(readyClient);
  } catch (err) {
    console.error('[mysql]', err);
  }
  hierarchy.startInterval(readyClient);
  await repostPanels(readyClient).catch((err) => console.error('[painel]', err));
  try {
    await refreshPlayers();
    await ensureFixedPanel(readyClient);
    await ensureTimeclock(readyClient);
    startTimeclock(readyClient);
    startBanRoleWatch(readyClient);
    startPlayerRefresh(readyClient, {
      buildEmbed: buildPanelEmbed,
      buildRows: buildPanelRows,
    });
  } catch (err) {
    console.error('[ingame] falha ao iniciar painel/ponto:', err);
  }
  backup.start(readyClient);
  console.log(`Sunville online como ${readyClient.user.tag}`);
});

client.on(Events.GuildMemberAdd, (member) => {
  logs.onJoin(member).catch((err) => console.error('[logs] join', err.message));
  restoreBanRoleOnJoin(member).catch((err) => console.error('[ban-role] join', err.message));
  restoreWarnRoleOnJoin(member).catch((err) => console.error('[warn-role] join', err.message));
});

client.on(Events.GuildMemberRemove, (member) => {
  logs.onLeave(member).catch((err) => console.error('[logs] leave', err.message));
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  calls.onVoiceStateUpdate(oldState, newState).catch((err) => console.error('[calls]', err.message));
});

client.on(Events.MessageCreate, (message) => {
  passlist.onMessage(message).catch((err) => console.error('[passlist]', err.message));
  antilink.onMessage(message).catch((err) => console.error('[antilink]', err.message));
});

client.on('error', (err) => {
  console.error('[client]', err);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'painel' || interaction.commandName === 'fixar-painel') {
        await ingame.handleInteraction(interaction);
        return;
      }
      await handleCommand(interaction);
      return;
    }
    if (ingame.isIngameCustomId(interaction.customId)) {
      await ingame.handleInteraction(interaction);
      return;
    }
    if (interaction.isChannelSelectMenu()) {
      if (interaction.customId.startsWith('cfg:')) await config.handleChannelSelect(interaction);
      return;
    }
    if (interaction.isRoleSelectMenu()) {
      if (interaction.customId.startsWith('cfg:')) await config.handleRoleSelect(interaction);
      return;
    }
    if (interaction.isUserSelectMenu()) {
      if (interaction.customId === 'ticket:pick-user') await tickets.openCallModal(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('cfg:')) await config.handleStringSelect(interaction);
      else if (interaction.customId === 'ticket:select') await tickets.handleSelect(interaction);
      else if (interaction.customId === 'verify:select') await verification.select(interaction);
      return;
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('cfg:')) await config.handleButton(interaction);
      else if (interaction.customId.startsWith('editor:')) await editor.handleButton(interaction);
      else if (interaction.customId.startsWith('ticket:rate:')) await ratings.handleButton(interaction);
      else if (interaction.customId === 'ticket:close') await tickets.closeTicket(interaction);
      else if (interaction.customId === 'ticket:claim') await tickets.handleClaim(interaction);
      else if (interaction.customId === 'ticket:call') await tickets.openCallPicker(interaction);
      else if (interaction.customId === 'suggest:open') await suggestions.openModal(interaction);
      else if (interaction.customId.startsWith('suggest:vote:')) await suggestions.handleVote(interaction);
      else if (interaction.customId === 'verify:start') await verification.start(interaction);
      else if (interaction.customId.startsWith('passlist:')) await passlist.handleButton(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('cfg:')) await config.handleModal(interaction);
      else if (interaction.customId.startsWith('editor-modal:')) await editor.handleModal(interaction);
      else if (interaction.customId.startsWith('ticket:dm-modal:')) await tickets.submitCallModal(interaction);
      else if (interaction.customId === 'suggest:modal') await suggestions.submitModal(interaction);
      else if (interaction.customId.startsWith('passlist:')) await passlist.handleModal(interaction);
    }
  } catch (err) {
    console.error('[interaction]', err);
    const payload = { embeds: [error(`Erro: ${err.message}`)], ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

async function handleCommand(interaction) {
  const name = interaction.commandName;
  const sub = interaction.options.getSubcommand(false);

  if (name === 'conectar') return game.handleCommand(interaction);
  if (name === 'configurar') return config.open(interaction);
  if (name === 'mensagem') return composer.open(interaction);
  if (name === 'chamar') return tickets.callFromCommand(interaction);
  if (name === 'fechar') return tickets.closeTicket(interaction);
  if (name === 'assumir') return tickets.handleClaim(interaction);

  if (name === 'ticket') {
    if (sub === 'painel') return tickets.publishPanel(interaction, interaction.options.getChannel('canal', true));
    if (sub === 'editar') return editor.openEditor(interaction, 'tickets', 'Tickets');
    if (sub === 'fechar') return tickets.closeTicket(interaction);
    if (sub === 'assumir') return tickets.handleClaim(interaction);
    if (sub === 'chamar') return tickets.callFromCommand(interaction);
    if (sub === 'add-categoria') return tickets.addCategory(interaction);
    if (sub === 'edit-categoria') return tickets.editCategory(interaction);
    if (sub === 'del-categoria') return tickets.removeCategory(interaction);
    if (sub === 'listar') return tickets.listCategories(interaction);
    if (sub === 'add-staff') return tickets.addStaffRole(interaction);
    if (sub === 'del-staff') return tickets.removeStaffRole(interaction);
  }

  if (name === 'hierarquia') {
    if (sub === 'enviar') return hierarchy.publish(interaction, interaction.options.getChannel('canal', true));
    if (sub === 'atualizar') return hierarchy.forceUpdate(interaction);
    if (sub === 'editar') return editor.openEditor(interaction, 'hierarchy', 'Hierarquia');
    if (sub === 'add-cargo') return hierarchy.addRole(interaction);
    if (sub === 'del-cargo') return hierarchy.removeRole(interaction);
    if (sub === 'listar') return hierarchy.listRoles(interaction);
  }

  if (name === 'conexao') {
    if (sub === 'enviar') return fivem.publish(interaction, interaction.options.getChannel('canal', true));
    if (sub === 'editar') return editor.openEditor(interaction, 'fivem', 'Conexão FiveM');
    if (sub === 'testar') return game.handleCommand(interaction);
    if (sub === 'link') return fivem.setConnect(interaction);
  }

  if (name === 'sugestao') {
    if (sub === 'painel') {
      return suggestions.publish(
        interaction,
        interaction.options.getChannel('canal', true),
        interaction.options.getChannel('destino', true),
      );
    }
    if (sub === 'editar') return editor.openEditor(interaction, 'suggestions', 'Sugestões');
    if (sub === 'canal') return suggestions.setReviewChannel(interaction, interaction.options.getChannel('destino', true));
  }

  if (name === 'verificacao') {
    if (sub === 'painel') {
      return verification.publish(
        interaction,
        interaction.options.getChannel('canal', true),
        interaction.options.getRole('cargo', true),
      );
    }
    if (sub === 'editar') return editor.openEditor(interaction, 'verification', 'Verificação');
    if (sub === 'cargo') return verification.setRole(interaction, interaction.options.getRole('cargo', true));
  }

  if (name === 'passlist') return passlist.handleCommand(interaction);

  if (name === 'logs' && sub === 'canal') {
    return logs.setChannel(interaction, interaction.options.getChannel('canal', true));
  }

  if (await denyIfNotAdmin(interaction)) return;
  await interaction.reply({ embeds: [error('Comando não reconhecido.')], ephemeral: true });
}

client.login(token);
