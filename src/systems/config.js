const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const store = require('../store');
const { fromVisual, success, error } = require('../utils/embeds');
const { denyIfNotAdmin } = require('../utils/permissions');
const { colors } = require('../config');
const editor = require('./editor');
const composer = require('./composer');
const backup = require('./backup');
const tickets = require('./tickets');
const hierarchy = require('./hierarchy');
const fivem = require('./fivem');
const suggestions = require('./suggestions');
const verification = require('./verification');
const passlist = require('./passlist');
const rename = require('./rename');

const pending = new Map();

function setPending(userId, patch) {
  pending.set(userId, { ...(pending.get(userId) || {}), ...patch });
}

function getPending(userId) {
  return pending.get(userId) || {};
}

function chan(id) {
  return id ? `<#${id}>` : '`não definido`';
}

function role(id) {
  return id ? `<@&${id}>` : '`não definido`';
}

function slug(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 16) || 'cat';
}

function navSelect(current) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cfg:nav')
      .setPlaceholder('Escolha o que configurar')
      .addOptions([
        { label: 'Início', value: 'home', emoji: '🏠', default: current === 'home' },
        { label: 'Tickets', value: 'tickets', emoji: '🎫', default: current === 'tickets' },
        { label: 'Hierarquia', value: 'hierarchy', emoji: '⭐', default: current === 'hierarchy' },
        { label: 'Conexão FiveM', value: 'fivem', emoji: '🎮', default: current === 'fivem' },
        { label: 'Sugestões', value: 'suggestions', emoji: '💡', default: current === 'suggestions' },
        { label: 'Verificação', value: 'verification', emoji: '✅', default: current === 'verification' },
        { label: 'Passlist', value: 'passlist', emoji: '📋', default: current === 'passlist' },
        { label: 'Rename Discord', value: 'rename', emoji: '🪪', default: current === 'rename' },
        { label: 'Entrada e saída', value: 'logs', emoji: '📥', default: current === 'logs' },
        { label: 'Painel in-game', value: 'ingame', emoji: '🛠️', default: current === 'ingame' },
        { label: 'Bate-ponto', value: 'timeclock', emoji: '⏱️', default: current === 'timeclock' },
        { label: 'Call automática', value: 'calls', emoji: '🎧', default: current === 'calls' },
        { label: 'Anti-link', value: 'antilink', emoji: '🔗', default: current === 'antilink' },
        { label: 'Criador de embed', value: 'composer', emoji: '📝', default: current === 'composer' },
        { label: 'Backup do banco', value: 'backup', emoji: '💾', default: current === 'backup' },
      ]),
  );
}

function backRow(id = 'cfg:home') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id).setLabel('Voltar').setStyle(ButtonStyle.Secondary),
  );
}

function textChannelSelect(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  );
}

function voiceChannelSelect(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(ChannelType.GuildVoice),
  );
}

function categoryChannelSelect(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(ChannelType.GuildCategory),
  );
}

function roleSelect(customId, placeholder, max = 1) {
  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(max),
  );
}

function homeView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '⚙️ Configurar • Sunville',
      description:
        'Tudo do bot se edita por este painel.\n' +
        'Escolha um módulo no menu e altere embeds, canais, cargos e publicações.\n\n' +
        `🎫 Painel de tickets → ${chan(d.tickets.panelChannelId)}\n` +
        `🗂️ Log de tickets (transcript) → ${chan(d.tickets.logChannelId)}\n` +
        `📥 Log de entrada/saída → ${chan(d.logs.channelId)}\n` +
        `⭐ Hierarquia → ${chan(d.hierarchy.channelId)}\n` +
        `🎮 FiveM → ${chan(d.fivem.channelId)}\n` +
        `💡 Sugestões → ${chan(d.suggestions.panelChannelId)}\n` +
        `✅ Verificação → ${chan(d.verification.panelChannelId)}\n` +
        `📋 Passlist → ${chan(d.passlist.panelChannelId)} • anúncio ${chan(d.passlist.publicLogChannelId)}\n` +
        `🪪 Rename Discord → ${d.rename?.enabled ? '`ligado`' : '`desligado`'}\n` +
        `🛠️ Painel in-game → ${chan(d.commands.panelChannelId)}\n` +
        `⏱️ Bate-ponto → ${chan(d.timeclock.channelId)}\n` +
        `🎧 Call automática → ${chan(d.calls.lobbyChannelId)}\n` +
        `🔗 Anti-link → ${d.antilink.enabled ? '`ligado`' : '`desligado`'}\n` +
        `⭐ Avaliação de ticket → ${chan(d.tickets.ratingChannelId)}\n` +
        `📝 Embeds salvos → **${(d.messages?.items || []).length}/25**\n` +
        `💾 Backup do banco → ${d.backup?.enabled ? chan(d.backup.channelId) : '`desligado`'}`,
      color: colors.gold,
      footer: 'Somente o cargo de configuração',
    })],
    components: [navSelect('home')],
  };
}

function ticketsView(state = {}) {
  const d = store.load();
  const cats = d.tickets.categories.map((c) => {
    const roles = (c.staffRoles || []).map(role).join(' ') || '`ainda sem cargo`';
    return `${c.emoji || '•'} **${c.label}** → pasta ${chan(c.discordCategoryId)}\nCargos: ${roles}`;
  }).join('\n\n') || '`nenhuma`';
  const selected = state.categoryId
    ? d.tickets.categories.find((c) => c.id === state.categoryId)
    : null;
  const selectedRoles = selected
    ? (selected.staffRoles || []).map(role).join(' ') || '`nenhum — só o cargo admin vê`'
    : null;
  return {
    embeds: [fromVisual({
      title: '🎫 Tickets',
      description:
        `Painel (abrir ticket): ${chan(d.tickets.panelChannelId)}\n` +
        `Log de tickets: ${chan(d.tickets.logChannelId)}\n` +
        `Entrada/saída (outro canal): ${chan(d.logs.channelId)}\n\n` +
        `**Categorias**\n${cats}\n\n` +
        (selected
          ? `Selecionada: **${selected.label}**\nPasta: ${chan(selected.discordCategoryId)}\nQuem vê: ${selectedRoles}\nInício: ${(selected.startMessage || '').slice(0, 180)}`
          : 'Selecione uma categoria para definir pasta, cargos que veem o ticket e a mensagem inicial.'),
      color: colors.gold,
    })],
    components: [
      navSelect('tickets'),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('cfg:ticket-cat')
          .setPlaceholder('Selecionar categoria')
          .setDisabled(!d.tickets.categories.length)
          .addOptions(d.tickets.categories.length
            ? d.tickets.categories.slice(0, 25).map((c) => ({
              label: c.label.slice(0, 100),
              description: (c.description || 'Categoria').slice(0, 100),
              value: c.id,
              emoji: tickets.menuEmoji(c.emoji),
              default: c.id === state.categoryId,
            }))
            : [{ label: 'Nenhuma', value: 'none' }]),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:tickets:embed').setLabel('Editar embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:tickets:addcat').setLabel('Nova categoria').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg:tickets:editcat').setLabel('Editar categoria').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:tickets:delcat').setLabel('Apagar categoria').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:tickets:folder').setLabel('Pasta Discord').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:tickets:staff').setLabel('Cargos que veem').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:tickets:log').setLabel('Log de tickets').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:tickets:extra').setLabel('Avaliação e rank').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:tickets:publish').setLabel('Publicar painel').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function ticketsStaffView(guild, state = {}) {
  const d = store.load();
  const cat = d.tickets.categories.find((c) => c.id === state.categoryId);
  if (!cat) {
    return ticketsView(state);
  }
  if (!Array.isArray(cat.staffRoles)) cat.staffRoles = [];
  const staff = cat.staffRoles.map(role).join('\n') || '`nenhum — só o cargo de configuração/admin vê`';
  const remove = cat.staffRoles.length
    ? new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('cfg:cat-staff-del')
        .setPlaceholder('Remover cargo desta categoria')
        .addOptions(cat.staffRoles.slice(0, 25).map((id) => ({
          label: (guild?.roles.cache.get(id)?.name || 'Cargo').slice(0, 100),
          description: id,
          value: id,
        }))),
    )
    : null;
  const rows = [
    navSelect('tickets'),
    roleSelect('cfg:role:cat-staff', 'Cargos que veem os tickets desta categoria', 5),
  ];
  if (remove) rows.push(remove);
  rows.push(backRow('cfg:mod:tickets'));
  return {
    embeds: [fromVisual({
      title: `🎫 Cargos • ${cat.label}`,
      description:
        `Quem tem estes cargos consegue **ver, assumir e fechar** tickets de **${cat.label}**.\n` +
        'O cargo de configuração sempre vê todos.\n\n' +
        staff,
      color: colors.gold,
    })],
    components: rows,
  };
}

function ticketsLogView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '🎫 Log de tickets',
      description:
        `Canal atual: ${chan(d.tickets.logChannelId)}\n\n` +
        'Este canal recebe **somente tickets**: abertura, fechamento e transcript.\n' +
        'Quem entra e sai do servidor **não** aparece aqui — isso fica em **Entrada e saída**.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:ticket-log', 'Canal só de logs de ticket'),
      backRow('cfg:mod:tickets'),
    ],
  };
}

function ticketsExtraView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '🎫 Avaliação e rank de assumidos',
      description:
        `Canal das avaliações: ${chan(d.tickets.ratingChannelId)}\n` +
        `Rank de tickets assumidos: ${chan(d.tickets.rankChannelId)}\n\n` +
        'Ao fechar o ticket, quem abriu recebe no privado um botão para avaliar o staff que assumiu.\n' +
        'O rank conta cada ticket assumido, reinicia sábado 00:01 e fica 30 dias no banco.\n\n' +
        'Nos embeds use `{ticket}`, `{categoria}`, `{closer}`, `{staff}`, `{jogador}`, `{nota}`, `{periodo}`, `{reset}` e `{lista}`.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:ticket-rating', 'Canal onde caem as avaliações'),
      textChannelSelect('cfg:ch:ticket-rank', 'Canal do rank de tickets assumidos'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:tickets:embed-rank').setLabel('Embed rank').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:tickets:embed-rank-closed').setLabel('Embed semana').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:tickets:embed-dm').setLabel('Embed do privado').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:tickets:embed-rating').setLabel('Embed avaliação').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:tickets:publish-rank').setLabel('Publicar rank').setStyle(ButtonStyle.Success),
      ),
      backRow('cfg:mod:tickets'),
    ],
  };
}

function ticketsPublishView() {
  return {
    embeds: [fromVisual({
      title: '🎫 Publicar painel',
      description: 'Escolha o canal onde o menu de tickets vai aparecer.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:tickets-publish', 'Canal do painel de tickets'),
      backRow('cfg:mod:tickets'),
    ],
  };
}

function ticketsFolderView() {
  return {
    embeds: [fromVisual({
      title: '🎫 Pasta da categoria',
      description: 'Escolha a categoria Discord onde esses tickets vão nascer.',
      color: colors.gold,
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('cfg:ch:cat-parent')
          .setPlaceholder('Categoria Discord')
          .addChannelTypes(ChannelType.GuildCategory),
      ),
      backRow('cfg:mod:tickets'),
    ],
  };
}

function hierarchyView(guild) {
  const d = store.load();
  const roles = d.hierarchy.roles.map((id, i) => `**${i + 1}.** ${role(id)}`).join('\n') || '`nenhum`';
  const remove = d.hierarchy.roles.length
    ? new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('cfg:hierarchy-del')
        .setPlaceholder('Remover cargo da hierarquia')
        .addOptions(d.hierarchy.roles.slice(0, 25).map((id, i) => ({
          label: `${i + 1}º ${guild?.roles.cache.get(id)?.name || 'cargo'}`.slice(0, 100),
          description: id,
          value: id,
        }))),
    )
    : null;
  const rows = [
    navSelect('hierarchy'),
    roleSelect('cfg:role:hierarchy-add', 'Adicionar cargo (ordem de cima para baixo)'),
  ];
  if (remove) rows.push(remove);
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg:hierarchy:embed').setLabel('Editar embed').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('cfg:hierarchy:refresh').setLabel('Atualizar agora').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg:hierarchy:publish').setLabel('Publicar').setStyle(ButtonStyle.Success),
  ));
  return {
    embeds: [fromVisual({
      title: '⭐ Hierarquia',
      description: `Canal: ${chan(d.hierarchy.channelId)}\nAtualiza sozinha a cada 1 hora.\n\n${roles}`,
      color: colors.gold,
    })],
    components: rows,
  };
}

function hierarchyPublishView() {
  return {
    embeds: [fromVisual({
      title: '⭐ Publicar hierarquia',
      description: 'Escolha o canal do embed da staff.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:hierarchy-publish', 'Canal da hierarquia'),
      backRow('cfg:mod:hierarchy'),
    ],
  };
}

function fivemView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '🎮 Conexão FiveM',
      description:
        `Canal: ${chan(d.fivem.channelId)}\n` +
        `Link: ${d.fivem.connectUrl || '`não definido`'}\n\n` +
        'Edite o embed, defina o botão de connect e publique.\n' +
        'Use **Testar conexão** ou `/conectar` para falar com o FiveM e o MySQL da MRI.',
      color: colors.gold,
    })],
    components: [
      navSelect('fivem'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:fivem:embed').setLabel('Editar embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:fivem:link').setLabel('Link de conexão').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:fivem:test').setLabel('Testar conexão').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:fivem:publish').setLabel('Publicar').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function fivemPublishView() {
  return {
    embeds: [fromVisual({
      title: '🎮 Publicar conexão',
      description: 'Escolha o canal do embed de conexão.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:fivem-publish', 'Canal da conexão FiveM'),
      backRow('cfg:mod:fivem'),
    ],
  };
}

function suggestionsView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '💡 Sugestões',
      description:
        `Painel (público): ${chan(d.suggestions.panelChannelId)}\n` +
        `Destino (votação): ${chan(d.suggestions.reviewChannelId)}\n\n` +
        'Defina os dois canais e publique o painel.',
      color: colors.info,
    })],
    components: [
      navSelect('suggestions'),
      textChannelSelect('cfg:ch:suggest-panel', 'Canal do painel (botão Enviar sugestão)'),
      textChannelSelect('cfg:ch:suggest-review', 'Canal onde as sugestões caem para voto'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:suggest:embed').setLabel('Editar embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:suggest:publish').setLabel('Publicar painel').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function verificationView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '✅ Verificação',
      description:
        `Painel: ${chan(d.verification.panelChannelId)}\n` +
        `Cargo liberado: ${role(d.verification.roleId)}\n\n` +
        'Escolha o cargo, o canal e publique.',
      color: colors.success,
    })],
    components: [
      navSelect('verification'),
      roleSelect('cfg:role:verify', 'Cargo dado ao acertar o código'),
      textChannelSelect('cfg:ch:verify-publish', 'Canal do painel de verificação'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:verify:embed').setLabel('Editar embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:verify:publish').setLabel('Publicar painel').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function passlistView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '📋 Passlist',
      description:
        `Formulário: ${chan(d.passlist.panelChannelId)}\n` +
        `Staff (aprovar/reprovar): ${chan(d.passlist.staffChannelId)}\n` +
        `Liberar ID: ${chan(d.passlist.releaseChannelId)}\n` +
        `Anúncio público: ${chan(d.passlist.publicLogChannelId)}\n` +
        `Categoria das entrevistas: ${chan(d.passlist.interviewCategoryId)}\n` +
        `Perguntas: **${(d.passlist.questions || []).length}**\n` +
        `Cargo em análise: ${role(d.passlist.pendingRoleId)}\n` +
        `Cargo aprovado: ${role(d.passlist.approvedRoleId)}\n\n` +
        'O jogador abre um canal privado com o bot, responde uma pergunta por vez e o chat fica limpo. ' +
        'No fim o canal some em 30 segundos.',
      color: colors.gold,
    })],
    components: [
      navSelect('passlist'),
      textChannelSelect('cfg:ch:passlist-panel', 'Canal do formulário (público)'),
      textChannelSelect('cfg:ch:passlist-staff', 'Canal da staff (aprovar/reprovar)'),
      textChannelSelect('cfg:ch:passlist-release', 'Canal de liberar ID (aprovados)'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:passlist:roles').setLabel('Cargos').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:passlist:embeds').setLabel('Embeds').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:passlist:questions').setLabel('Perguntas').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:passlist:public-log').setLabel('Anúncio público').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:passlist:publish-menu').setLabel('Publicar').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function passlistEmbedsView() {
  return {
    embeds: [fromVisual({
      title: '📋 Passlist • Embeds',
      description: 'Edite o painel público do formulário e o painel de liberar ID.',
      color: colors.gold,
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:passlist:embed').setLabel('Embed form').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:passlist:embed-release').setLabel('Embed ID').setStyle(ButtonStyle.Primary),
      ),
      backRow('cfg:mod:passlist'),
    ],
  };
}

function passlistQuestionsView(userId) {
  const d = store.load();
  const list = d.passlist.questions || [];
  const selected = getPending(userId).passlistQuestionId;
  const current = list.find((item) => item.id === selected) || null;
  const lines = list.map((item, index) => `**${index + 1}.** ${item.prompt}`).join('\n') || '`nenhuma`';
  return {
    embeds: [fromVisual({
      title: '📋 Passlist • Perguntas',
      description:
        `Categoria das entrevistas: ${chan(d.passlist.interviewCategoryId)}\n` +
        `Selecionada: ${current ? `**${current.prompt}**` : '`nenhuma`'}\n\n${lines}\n\n` +
        'O bot pergunta uma por vez no canal privado. Depois da resposta, as duas mensagens somem.',
      color: colors.gold,
    })],
    components: [
      categoryChannelSelect('cfg:ch:passlist-interview', 'Categoria onde as entrevistas nascem'),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('cfg:passlist-q-pick')
          .setPlaceholder(list.length ? 'Escolher uma pergunta' : 'Nenhuma pergunta')
          .setDisabled(!list.length)
          .addOptions(list.length
            ? list.slice(0, 25).map((item) => ({
              label: item.prompt.slice(0, 100),
              value: item.id,
              default: item.id === selected,
            }))
            : [{ label: 'Nenhuma', value: 'none' }]),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:passlist:q-add').setLabel('Nova pergunta').setStyle(ButtonStyle.Success).setDisabled(list.length >= 20),
        new ButtonBuilder().setCustomId('cfg:passlist:q-edit').setLabel('Editar').setStyle(ButtonStyle.Primary).setDisabled(!current),
        new ButtonBuilder().setCustomId('cfg:passlist:q-del').setLabel('Apagar').setStyle(ButtonStyle.Danger).setDisabled(!current),
      ),
      backRow('cfg:mod:passlist'),
    ],
  };
}

function passlistPublishView() {
  return {
    embeds: [fromVisual({
      title: '📋 Passlist • Publicar',
      description: 'Escolha qual painel enviar no canal já configurado.',
      color: colors.gold,
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:passlist:publish').setLabel('Publicar formulário').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg:passlist:publish-release').setLabel('Publicar liberar ID').setStyle(ButtonStyle.Success),
      ),
      backRow('cfg:mod:passlist'),
    ],
  };
}

function passlistPublicLogView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '📋 Passlist • Anúncio público',
      description:
        `Canal: ${chan(d.passlist.publicLogChannelId)}\n\n` +
        'Quando a staff aprovar ou reprovar, o embed vai neste canal para todo mundo.\n\n' +
        'Variáveis: `{user}` `{userTag}` `{userId}` `{staff}` `{staffTag}` `{staffId}` `{nome}` `{idade}` `{experiencia}` `{interesse}` `{historico}` `{motivo}`\n' +
        '`{motivo}` é o texto da reprovação. Na aprovação fica `—`.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:passlist-public-log', 'Canal do anúncio público'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:passlist:embed-approved').setLabel('Embed aprovado').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg:passlist:embed-rejected').setLabel('Embed reprovado').setStyle(ButtonStyle.Danger),
      ),
      backRow('cfg:mod:passlist'),
    ],
  };
}

function passlistRolesView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '📋 Passlist • Cargos',
      description:
        `Em análise (ao enviar o form): ${role(d.passlist.pendingRoleId)}\n` +
        `Aprovado (vê o canal de liberar ID): ${role(d.passlist.approvedRoleId)}`,
      color: colors.gold,
    })],
    components: [
      roleSelect('cfg:role:passlist-pending', 'Cargo dado ao enviar o formulário'),
      roleSelect('cfg:role:passlist-approved', 'Cargo que libera o canal de ID'),
      backRow('cfg:mod:passlist'),
    ],
  };
}

function maskToken(value) {
  const text = String(value || '');
  if (!text) return '`não definido`';
  if (text.length <= 6) return '`••••`';
  return `\`${text.slice(0, 4)}…${text.slice(-4)}\``;
}

function ingameView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '🛠️ Painel in-game',
      description:
        `Canal do painel: ${chan(d.commands.panelChannelId)}\n` +
        `Log dos comandos: ${chan(d.commands.logChannelId)}\n` +
        `Log público de ban: ${chan(d.commands.banLogChannelId)}\n` +
        `Cargo staff: ${role(d.commands.staffRoleId)}\n` +
        `Cargo de banido: ${role(d.commands.banRoleId)}\n` +
        `Adv 1/2/3: ${role(d.commands.warnRole1Id)} / ${role(d.commands.warnRole2Id)} / ${role(d.commands.warnRole3Id)}\n\n` +
        `**Ponte FiveM**\n` +
        `URL: \`${d.commands.fivemUrl || '—'}\`\n` +
        `Resource: \`${d.commands.fivemResource || 'sunville_bridge'}\`\n` +
        `Token: ${maskToken(d.commands.fivemToken)}\n\n` +
        'O painel envia comandos ao resource `sunville_bridge`. ' +
        'Quem tem o cargo staff (ou funções no Gerenciar cargos) consegue usar.',
      color: colors.gold,
    })],
    components: [
      navSelect('ingame'),
      roleSelect('cfg:role:ingame-staff', 'Cargo da staff in-game'),
      textChannelSelect('cfg:ch:ingame-log', 'Canal de log dos comandos'),
      textChannelSelect('cfg:ch:ingame-panel', 'Canal do painel de comandos'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:ingame:bridge').setLabel('Ponte FiveM').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:ingame:embed').setLabel('Editar embed').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ingame:ban-log').setLabel('Log de ban').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ingame:roles').setLabel('Cargos ban/adv').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ingame:publish').setLabel('Publicar painel').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function ingameBridgeView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '🛠️ Ponte FiveM',
      description:
        `URL: \`${d.commands.fivemUrl || '—'}\`\n` +
        `Resource: \`${d.commands.fivemResource || 'sunville_bridge'}\`\n` +
        `Token: ${maskToken(d.commands.fivemToken)}\n\n` +
        'URL é a porta do jogo (em geral 30120). Resource e token vêm do `sunville_bridge`.',
      color: colors.gold,
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:ingame:bridge-edit').setLabel('Editar conexão').setStyle(ButtonStyle.Primary),
      ),
      backRow('cfg:mod:ingame'),
    ],
  };
}

function ingameBanLogView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '🛠️ Log público de ban',
      description:
        `Canal: ${chan(d.commands.banLogChannelId)}\n\n` +
        'Ban, desban, advertência e remoção de advertência usam este canal.\n\n' +
        'Ban: `{staff}` `{staffTag}` `{staffId}` `{jogador}` `{playerId}` `{motivo}` `{duracao}` `{duracaoTexto}` `{resultado}`\n' +
        'Desban / adv: `{staff}` `{jogador}` `{motivo}` `{nivel}` `{nivelTexto}`',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:ingame-ban-log', 'Canal do log público de ban'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:ingame:embed-ban').setLabel('Embed de ban').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:ingame:embed-unban').setLabel('Embed de desban').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ingame:embed-warn').setLabel('Embed de adv').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ingame:embed-unwarn').setLabel('Embed tirar adv').setStyle(ButtonStyle.Secondary),
      ),
      backRow('cfg:mod:ingame'),
    ],
  };
}

function ingameRolesView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '🛠️ Cargos de ban e advertência',
      description:
        `Banido: ${role(d.commands.banRoleId)}\n` +
        `1ª advertência: ${role(d.commands.warnRole1Id)}\n` +
        `2ª advertência: ${role(d.commands.warnRole2Id)}\n` +
        `3ª advertência: ${role(d.commands.warnRole3Id)}\n\n` +
        'O cargo de banido é aplicado no Discord ao banir e removido ao desbanir. ' +
        'As advertências sobem de 1 para 2 e de 2 para 3 automaticamente.',
      color: colors.gold,
    })],
    components: [
      roleSelect('cfg:role:ingame-ban', 'Cargo de banido'),
      roleSelect('cfg:role:ingame-warn1', 'Cargo da 1ª advertência'),
      roleSelect('cfg:role:ingame-warn2', 'Cargo da 2ª advertência'),
      roleSelect('cfg:role:ingame-warn3', 'Cargo da 3ª advertência'),
      backRow('cfg:mod:ingame'),
    ],
  };
}

function ingamePublishView() {
  return {
    embeds: [fromVisual({
      title: '🛠️ Publicar painel in-game',
      description: 'Escolha o canal onde o painel de comandos vai ficar fixo.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:ingame-publish', 'Canal do painel de comandos'),
      backRow('cfg:mod:ingame'),
    ],
  };
}

function timeclockView() {
  const d = store.load();
  const { describeReset } = require('../ingame/timeclock/time');
  return {
    embeds: [fromVisual({
      title: '⏱️ Bate-ponto',
      description:
        `Painel: ${chan(d.timeclock.channelId)}\n` +
        `Rank semanal (ao vivo): ${chan(d.timeclock.rankChannelId)}\n` +
        `Log de ponto: ${chan(d.timeclock.logChannelId)}\n` +
        `Log do rank semanal: ${chan(d.timeclock.weeklyLogChannelId)}\n` +
        `Cargo: ${d.timeclock.roleId ? role(d.timeclock.roleId) : '`todos`'}\n` +
        `Fuso: \`${d.timeclock.timezone || 'America/Sao_Paulo'}\`\n` +
        `Semana: **${describeReset()}**\n\n` +
        'O log de ponto registra início e fim. O log semanal cai todo sábado 00:01.',
      color: colors.gold,
    })],
    components: [
      navSelect('timeclock'),
      textChannelSelect('cfg:ch:ponto-panel', 'Canal do painel de ponto'),
      textChannelSelect('cfg:ch:ponto-rank', 'Canal do rank semanal'),
      roleSelect('cfg:role:ponto', 'Cargo que pode bater ponto'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:ponto:horario').setLabel('Fuso e semana').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:ponto:embeds').setLabel('Editar embeds').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ponto:logs').setLabel('Logs').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ponto:publish').setLabel('Publicar ponto').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg:ponto:publish-rank').setLabel('Publicar rank').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function pontoPublishView(kind) {
  const rank = kind === 'rank';
  return {
    embeds: [fromVisual({
      title: rank ? '⏱️ Publicar rank' : '⏱️ Publicar bate-ponto',
      description: rank
        ? 'Escolha o canal do rank semanal.'
        : 'Escolha o canal do painel de ponto.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect(rank ? 'cfg:ch:ponto-publish-rank' : 'cfg:ch:ponto-publish', rank ? 'Canal do rank' : 'Canal do ponto'),
      backRow('cfg:mod:timeclock'),
    ],
  };
}

function timeclockLogsView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '⏱️ Logs de bate-ponto',
      description:
        `Log de início/fim: ${chan(d.timeclock.logChannelId)}\n` +
        `Log do rank semanal (sábado 00:01): ${chan(d.timeclock.weeklyLogChannelId)}\n\n` +
        'O log de ponto é separado do rank ao vivo. No sábado 00:01 o snapshot da semana vai no canal de log semanal.',
      color: colors.gold,
    })],
    components: [
      textChannelSelect('cfg:ch:ponto-log', 'Canal do log de início e fim'),
      textChannelSelect('cfg:ch:ponto-weekly', 'Canal do log de rank semanal'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:ponto:clearrole').setLabel('Liberar ponto para todos').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ponto:embed-start').setLabel('Embed início').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:ponto:embed-stop').setLabel('Embed fim').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:ponto:embed-weekly').setLabel('Embed log semanal').setStyle(ButtonStyle.Primary),
      ),
      backRow('cfg:mod:timeclock'),
    ],
  };
}

function timeclockEmbedsView() {
  return {
    embeds: [fromVisual({
      title: '⏱️ Embeds do bate-ponto',
      description:
        'Edite título, texto, cor, imagem e rodapé.\n\n' +
        'No texto você pode usar `{reset}`, `{fuso}`, `{periodo}`, `{lista}`, `{user}` e `{duracao}`.',
      color: colors.gold,
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:ponto:embed-panel').setLabel('Painel').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:ponto:embed-rank').setLabel('Rank ao vivo').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:ponto:embed-weekly').setLabel('Log semanal').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:ponto:embed-start').setLabel('Log início').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:ponto:embed-stop').setLabel('Log fim').setStyle(ButtonStyle.Secondary),
      ),
      backRow('cfg:mod:timeclock'),
    ],
  };
}

function callsView(guild) {
  const d = store.load();
  const staff = (d.calls.staffRoles || []).map(role).join(' ') || '`qualquer staff (tickets/admin)`';
  return {
    embeds: [fromVisual({
      title: '🎧 Call automática de atendimento',
      description:
        `Call de espera: ${chan(d.calls.lobbyChannelId)}\n` +
        `Pasta das calls: ${chan(d.calls.categoryId)}\n` +
        `Nome: **${d.calls.namePrefix || 'Atendimento'} Nome**\n` +
        `Cargo com todas as permissões: ${role(d.calls.privilegedRoleId)}\n` +
        `Log das calls: ${chan(d.calls.logChannelId)}\n` +
        `Quem gera a call ao entrar: ${staff}\n\n` +
        'Quando a staff entra na call de espera, o bot cria a call e move a pessoa. ' +
        'A call some quando fica vazia.',
      color: colors.gold,
    })],
    components: [
      navSelect('calls'),
      voiceChannelSelect('cfg:ch:calls-lobby', 'Call de espera (entra e cria atendimento)'),
      categoryChannelSelect('cfg:ch:calls-folder', 'Pasta onde nascem as calls'),
      roleSelect('cfg:role:calls-privileged', 'Cargo com todas as permissões na call'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:calls:staff').setLabel('Cargos').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:calls:prefix').setLabel('Nome da call').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:calls:log').setLabel('Canal de log').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:calls:embed').setLabel('Editar embed').setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

function callsStaffView(guild) {
  const d = store.load();
  if (!Array.isArray(d.calls.staffRoles)) d.calls.staffRoles = [];
  const list = d.calls.staffRoles.map(role).join('\n') || '`qualquer staff (tickets/admin)`';
  const remove = d.calls.staffRoles.length
    ? new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('cfg:calls-staff-del')
        .setPlaceholder('Remover cargo')
        .addOptions(d.calls.staffRoles.slice(0, 25).map((id) => ({
          label: (guild?.roles.cache.get(id)?.name || 'Cargo').slice(0, 100),
          description: id,
          value: id,
        }))),
    )
    : null;
  const rows = [
    roleSelect('cfg:role:calls-staff', 'Cargos que, ao entrar na espera, geram call', 5),
  ];
  if (remove) rows.push(remove);
  rows.push(backRow('cfg:mod:calls'));
  return {
    embeds: [fromVisual({
      title: '🎧 Cargos da call automática',
      description:
        'Quem tem estes cargos entra na call de espera e ganha **Atendimento Nome**.\n' +
        'Lista vazia = qualquer staff de ticket, in-game ou admin.\n\n' +
        list,
      color: colors.gold,
    })],
    components: rows,
  };
}

function antilinkView(guild) {
  const d = store.load();
  const roles = (d.antilink.allowedRoles || []).map(role).join(' ') || '`nenhum`';
  const channels = (d.antilink.allowedChannels || []).map(chan).join(' ') || '`nenhum`';
  const domains = (d.antilink.allowedDomains || []).map((x) => `\`${x}\``).join(', ') || '`nenhum — bloqueia qualquer link`';
  return {
    embeds: [fromVisual({
      title: '🔗 Anti-link',
      description:
        `Status: ${d.antilink.enabled ? '**ligado**' : '**desligado**'}\n` +
        `Cargos liberados: ${roles}\n` +
        `Canais liberados: ${channels}\n` +
        `Domínios permitidos: ${domains}\n\n` +
        'Mensagens com link são apagadas, exceto cargos/canais liberados, admin e quem gerencia mensagens.',
      color: colors.gold,
    })],
    components: [
      navSelect('antilink'),
      roleSelect('cfg:role:antilink', 'Cargos que podem mandar link', 5),
      textChannelSelect('cfg:ch:antilink', 'Canais onde o anti-link não age'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('cfg:antilink:toggle')
          .setLabel(d.antilink.enabled ? 'Desligar' : 'Ligar')
          .setStyle(d.antilink.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg:antilink:domains').setLabel('Domínios').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:antilink:embed').setLabel('Editar aviso').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:antilink:clear-roles').setLabel('Limpar cargos').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:antilink:clear-channels').setLabel('Limpar canais').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function backupView() {
  const d = store.load();
  const b = d.backup || {};
  return {
    embeds: [fromVisual({
      title: '💾 Backup do banco FiveM',
      description:
        `Status: ${b.enabled ? '`ligado`' : '`desligado`'}\n` +
        `Canal: ${chan(b.channelId)}\n` +
        `Intervalo: **${b.intervalHours || 8} horas**\n` +
        `Último backup: ${backup.lastLabel()}\n` +
        `Próximo: ${backup.nextLabel()}\n` +
        (b.lastFile ? `Arquivo: \`${b.lastFile}\`\n` : '') +
        '\nO bot gera um `.sql.gz` do MySQL da cidade e envia neste canal.\n' +
        'Se o arquivo for grande, vai partido. Cópias locais ficam em `data/backups`.\n\n' +
        'Variáveis do embed: `{banco}` `{arquivo}` `{tamanho}` `{tabelas}` `{quando}` `{proximo}`',
      color: colors.gold,
    })],
    components: [
      navSelect('backup'),
      textChannelSelect('cfg:ch:backup', 'Canal que recebe o backup'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('cfg:backup:toggle')
          .setLabel(b.enabled ? 'Desligar' : 'Ligar')
          .setStyle(b.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg:backup:now').setLabel('Backup agora').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:backup:embed').setLabel('Editar embed').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function renameView(guild) {
  const d = store.load();
  const r = d.rename || {};
  const skips = (r.skipRoles || []).map(role).join(' ') || '`nenhum`';
  const remove = (r.skipRoles || []).length
    ? new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('cfg:rename-skip-del')
        .setPlaceholder('Remover cargo ignorado')
        .addOptions(r.skipRoles.slice(0, 25).map((id) => ({
          label: (guild?.roles.cache.get(id)?.name || 'Cargo').slice(0, 100),
          description: id,
          value: id,
        }))),
    )
    : null;
  const rows = [
    navSelect('rename'),
    textChannelSelect('cfg:ch:rename-log', 'Canal de log do rename (opcional)'),
    roleSelect('cfg:role:rename-skip', 'Cargos que não terão o nick alterado', 5),
  ];
  if (remove) rows.push(remove);
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cfg:rename:toggle')
      .setLabel(r.enabled ? 'Desligar' : 'Ligar')
      .setStyle(r.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cfg:rename:sync').setLabel('Sincronizar todos').setStyle(ButtonStyle.Primary),
  ));
  return {
    embeds: [fromVisual({
      title: '🪪 Rename Discord',
      description:
        `Status: ${r.enabled ? '**ligado**' : '**desligado**'}\n` +
        `Log: ${chan(r.logChannelId)}\n` +
        `Cargos ignorados: ${skips}\n` +
        `Nicks aplicados: **${rename.count()}**\n\n` +
        'Quando alguém **cria o personagem** na cidade, o apelido no Discord vira:\n' +
        '`PrimeiroNome | #citizenid`\n\n' +
        'O bot precisa de **Gerenciar apelidos** e o cargo dele tem que ficar acima do jogador.\n' +
        'Personagens que já existiam na hora de ligar o bot não mudam sozinhos — use **Sincronizar todos**.',
      color: colors.gold,
    })],
    components: rows,
  };
}

function logsView() {
  const d = store.load();
  return {
    embeds: [fromVisual({
      title: '📥 Log de entrada e saída',
      description:
        `Canal atual: ${chan(d.logs.channelId)}\n\n` +
        'Aqui entra **somente** quem entra e quem sai do Discord.\n' +
        'Transcript e fechamento de ticket vão no canal **Log de tickets**, em Tickets.',
      color: colors.gold,
    })],
    components: [
      navSelect('logs'),
      textChannelSelect('cfg:ch:logs', 'Canal de quem entra e sai'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:logs:embed-join').setLabel('Embed de entrada').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:logs:embed-leave').setLabel('Embed de saída').setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

function moduleView(name, userId, guild) {
  if (name === 'tickets') return ticketsView(getPending(userId));
  if (name === 'hierarchy') return hierarchyView(guild);
  if (name === 'fivem') return fivemView();
  if (name === 'suggestions') return suggestionsView();
  if (name === 'verification') return verificationView();
  if (name === 'passlist') return passlistView();
  if (name === 'rename') return renameView(guild);
  if (name === 'logs') return logsView();
  if (name === 'ingame') return ingameView();
  if (name === 'timeclock') return timeclockView();
  if (name === 'calls') return callsView(guild);
  if (name === 'antilink') return antilinkView(guild);
  if (name === 'composer') return composer.listView(userId);
  if (name === 'backup') return backupView();
  return homeView();
}

async function show(interaction, view) {
  const payload = { embeds: view.embeds, components: view.components };
  if (interaction.isChatInputCommand()) {
    await interaction.reply({ ...payload, ephemeral: true });
    return;
  }
  if (interaction.isModalSubmit()) {
    if (interaction.message) {
      await interaction.message.edit(payload).catch(() => {});
    }
    await interaction.reply({ embeds: [success('Alteração salva.')], ephemeral: true });
    return;
  }
  await interaction.update(payload);
}

async function open(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  pending.set(interaction.user.id, {});
  await show(interaction, homeView());
}

function categoryModal(customId, title, cat = {}) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  const nome = new TextInputBuilder()
    .setCustomId('nome')
    .setLabel('Nome na lista')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);
  if (cat.label) nome.setValue(cat.label.slice(0, 80));
  const descricao = new TextInputBuilder()
    .setCustomId('descricao')
    .setLabel('Descrição da opção')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);
  if (cat.description) descricao.setValue(cat.description.slice(0, 100));
  const emoji = new TextInputBuilder()
    .setCustomId('emoji')
    .setLabel('Emoji')
    .setPlaceholder('Pode colar o emoji do celular')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(64);
  if (cat.emoji) emoji.setValue(String(cat.emoji).slice(0, 64));
  const inicio = new TextInputBuilder()
    .setCustomId('inicio')
    .setLabel('Mensagem padrão do ticket')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1500);
  if (cat.startMessage) inicio.setValue(cat.startMessage.slice(0, 1500));
  modal.addComponents(
    new ActionRowBuilder().addComponents(nome),
    new ActionRowBuilder().addComponents(descricao),
    new ActionRowBuilder().addComponents(emoji),
    new ActionRowBuilder().addComponents(inicio),
  );
  return modal;
}

async function handleButton(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  if (composer.isComposerId(interaction.customId)) return composer.handleButton(interaction);
  const id = interaction.customId;
  const userId = interaction.user.id;

  if (id === 'cfg:logs:embed-join') {
    return show(interaction, editor.editorPayload('logsJoin', 'Log de entrada', 'cfg:mod:logs'));
  }
  if (id === 'cfg:logs:embed-leave') {
    return show(interaction, editor.editorPayload('logsLeave', 'Log de saída', 'cfg:mod:logs'));
  }
  if (id === 'cfg:backup:toggle') {
    store.update((s) => {
      s.backup.enabled = !s.backup.enabled;
    });
    return show(interaction, backupView());
  }
  if (id === 'cfg:backup:now') return backup.runNow(interaction);
  if (id === 'cfg:backup:embed') {
    return show(interaction, editor.editorPayload('backupLog', 'Backup do banco', 'cfg:mod:backup'));
  }
  if (id === 'cfg:mod:logs') return show(interaction, logsView());
  if (id === 'cfg:mod:backup') return show(interaction, backupView());
  if (id === 'cfg:home') return show(interaction, homeView());
  if (id === 'cfg:mod:tickets') return show(interaction, ticketsView(getPending(userId)));
  if (id === 'cfg:mod:hierarchy') return show(interaction, hierarchyView(interaction.guild));
  if (id === 'cfg:mod:fivem') return show(interaction, fivemView());
  if (id === 'cfg:mod:suggestions') return show(interaction, suggestionsView());
  if (id === 'cfg:mod:verification') return show(interaction, verificationView());
  if (id === 'cfg:mod:passlist') return show(interaction, passlistView());
  if (id === 'cfg:mod:rename') return show(interaction, renameView(interaction.guild));
  if (id === 'cfg:mod:ingame') return show(interaction, ingameView());
  if (id === 'cfg:mod:timeclock') return show(interaction, timeclockView());
  if (id === 'cfg:mod:calls') return show(interaction, callsView(interaction.guild));
  if (id === 'cfg:mod:antilink') return show(interaction, antilinkView(interaction.guild));

  if (id === 'cfg:tickets:embed') {
    return show(interaction, editor.editorPayload('tickets', 'Tickets', 'cfg:mod:tickets'));
  }
  if (id === 'cfg:tickets:publish') return show(interaction, ticketsPublishView());
  if (id === 'cfg:tickets:log') return show(interaction, ticketsLogView());
  if (id === 'cfg:tickets:extra') return show(interaction, ticketsExtraView());
  if (id === 'cfg:tickets:embed-rank') {
    return show(interaction, editor.editorPayload('ticketRank', 'Rank de tickets', 'cfg:tickets:extra'));
  }
  if (id === 'cfg:tickets:embed-rank-closed') {
    return show(interaction, editor.editorPayload('ticketRankClosed', 'Rank de tickets • semana', 'cfg:tickets:extra'));
  }
  if (id === 'cfg:tickets:embed-dm') {
    return show(interaction, editor.editorPayload('ticketCloseDm', 'Privado ao fechar ticket', 'cfg:tickets:extra'));
  }
  if (id === 'cfg:tickets:embed-rating') {
    return show(interaction, editor.editorPayload('ticketRatingLog', 'Log de avaliação', 'cfg:tickets:extra'));
  }
  if (id === 'cfg:tickets:publish-rank') {
    const channelId = store.load().tickets.rankChannelId;
    if (!channelId) {
      await interaction.reply({ embeds: [error('Escolha o canal do rank primeiro.')], ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      await interaction.reply({ embeds: [error('Canal do rank inválido.')], ephemeral: true });
      return;
    }
    const message = await require('./ticket-rank').publishRank(channel);
    await interaction.reply({ embeds: [success(`Rank de tickets publicado em ${channel}. [Abrir](${message.url})`)], ephemeral: true });
    return;
  }
  if (id === 'cfg:tickets:staff') {
    if (!getPending(userId).categoryId) {
      await interaction.reply({ embeds: [error('Selecione uma categoria na lista primeiro.')], ephemeral: true });
      return;
    }
    return show(interaction, ticketsStaffView(interaction.guild, getPending(userId)));
  }
  if (id === 'cfg:tickets:addcat') {
    await interaction.showModal(categoryModal('cfg:cat-add', 'Nova categoria'));
    return;
  }
  if (id === 'cfg:tickets:editcat') {
    const catId = getPending(userId).categoryId;
    const cat = store.load().tickets.categories.find((c) => c.id === catId);
    if (!cat) {
      await interaction.reply({ embeds: [error('Selecione uma categoria na lista primeiro.')], ephemeral: true });
      return;
    }
    await interaction.showModal(categoryModal(`cfg:cat-edit:${cat.id}`, `Editar ${cat.label}`, cat));
    return;
  }
  if (id === 'cfg:tickets:delcat') {
    const catId = getPending(userId).categoryId;
    const removed = store.update((s) => {
      const idx = s.tickets.categories.findIndex((c) => c.id === catId);
      if (idx === -1) return null;
      return s.tickets.categories.splice(idx, 1)[0];
    });
    if (!removed) {
      await interaction.reply({ embeds: [error('Selecione uma categoria na lista primeiro.')], ephemeral: true });
      return;
    }
    setPending(userId, { categoryId: null });
    await editor.refreshPublished(interaction.client, 'tickets');
    return show(interaction, ticketsView(getPending(userId)));
  }
  if (id === 'cfg:tickets:folder') {
    if (!getPending(userId).categoryId) {
      await interaction.reply({ embeds: [error('Selecione uma categoria na lista primeiro.')], ephemeral: true });
      return;
    }
    return show(interaction, ticketsFolderView());
  }

  if (id === 'cfg:hierarchy:embed') {
    return show(interaction, editor.editorPayload('hierarchy', 'Hierarquia', 'cfg:mod:hierarchy'));
  }
  if (id === 'cfg:hierarchy:publish') return show(interaction, hierarchyPublishView());
  if (id === 'cfg:hierarchy:refresh') {
    await interaction.deferUpdate();
    await hierarchy.refreshMessage(interaction.client);
    await interaction.followUp({ embeds: [success('Hierarquia atualizada.')], ephemeral: true });
    return;
  }

  if (id === 'cfg:fivem:embed') {
    return show(interaction, editor.editorPayload('fivem', 'Conexão FiveM', 'cfg:mod:fivem'));
  }
  if (id === 'cfg:fivem:publish') return show(interaction, fivemPublishView());
  if (id === 'cfg:fivem:test') {
    await interaction.deferReply({ ephemeral: true });
    const { embed } = await require('../game').testBoth();
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  if (id === 'cfg:fivem:link') {
    const current = store.load().fivem.connectUrl || '';
    const modal = new ModalBuilder().setCustomId('cfg:fivem-url').setTitle('Link de conexão');
    const input = new TextInputBuilder()
      .setCustomId('url')
      .setLabel('URL http(s) do cfx.re')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(300);
    if (current) input.setValue(current.slice(0, 300));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id === 'cfg:suggest:embed') {
    return show(interaction, editor.editorPayload('suggestions', 'Sugestões', 'cfg:mod:suggestions'));
  }
  if (id === 'cfg:suggest:publish') {
    const d = store.load();
    if (!d.suggestions.panelChannelId || !d.suggestions.reviewChannelId) {
      await interaction.reply({ embeds: [error('Defina os dois canais no menu acima antes de publicar.')], ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(d.suggestions.panelChannelId).catch(() => null);
    if (!channel) {
      await interaction.reply({ embeds: [error('Canal do painel inválido.')], ephemeral: true });
      return;
    }
    const message = await channel.send(suggestions.buildPanel(d));
    store.update((s) => {
      s.suggestions.panelMessageId = message.id;
    });
    await interaction.reply({ embeds: [success(`Painel publicado em ${channel}.`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:verify:embed') {
    return show(interaction, editor.editorPayload('verification', 'Verificação', 'cfg:mod:verification'));
  }
  if (id === 'cfg:verify:publish') {
    const d = store.load();
    if (!d.verification.roleId) {
      await interaction.reply({ embeds: [error('Escolha o cargo da verificação primeiro.')], ephemeral: true });
      return;
    }
    if (!d.verification.panelChannelId) {
      await interaction.reply({ embeds: [error('Escolha o canal da verificação primeiro.')], ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(d.verification.panelChannelId).catch(() => null);
    if (!channel) {
      await interaction.reply({ embeds: [error('Canal inválido.')], ephemeral: true });
      return;
    }
    const message = await channel.send(verification.buildPanel(d));
    store.update((s) => {
      s.verification.panelMessageId = message.id;
    });
    await interaction.reply({ embeds: [success(`Painel publicado em ${channel}.`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:passlist:roles') return show(interaction, passlistRolesView());
  if (id === 'cfg:passlist:embeds') return show(interaction, passlistEmbedsView());
  if (id === 'cfg:passlist:questions') return show(interaction, passlistQuestionsView(userId));
  if (id === 'cfg:passlist:publish-menu') return show(interaction, passlistPublishView());
  if (id === 'cfg:passlist:public-log') return show(interaction, passlistPublicLogView());
  if (id === 'cfg:passlist:embed') {
    return show(interaction, editor.editorPayload('passlist', 'Passlist', 'cfg:passlist:embeds'));
  }
  if (id === 'cfg:passlist:embed-release') {
    return show(interaction, editor.editorPayload('passlistRelease', 'Liberar ID', 'cfg:passlist:embeds'));
  }
  if (id === 'cfg:passlist:q-add') {
    const modal = new ModalBuilder().setCustomId('cfg:passlist-q-add').setTitle('Nova pergunta');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('prompt')
        .setLabel('Pergunta que o bot vai enviar')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder('Ex: Qual o nome do seu personagem (IC)?'),
    ));
    await interaction.showModal(modal);
    return;
  }
  if (id === 'cfg:passlist:q-edit') {
    const current = (store.load().passlist.questions || []).find((item) => item.id === getPending(userId).passlistQuestionId);
    if (!current) {
      await interaction.reply({ embeds: [error('Selecione uma pergunta na lista.')], ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId('cfg:passlist-q-edit').setTitle('Editar pergunta');
    const input = new TextInputBuilder()
      .setCustomId('prompt')
      .setLabel('Pergunta que o bot vai enviar')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000)
      .setValue(String(current.prompt).slice(0, 1000));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
  if (id === 'cfg:passlist:q-del') {
    const selected = getPending(userId).passlistQuestionId;
    store.update((s) => {
      s.passlist.questions = (s.passlist.questions || []).filter((item) => item.id !== selected);
    });
    setPending(userId, { passlistQuestionId: null });
    return show(interaction, passlistQuestionsView(userId));
  }
  if (id === 'cfg:passlist:embed-approved') {
    return show(interaction, editor.editorPayload('passlistApprovedPublic', 'Anúncio de aprovado', 'cfg:passlist:public-log'));
  }
  if (id === 'cfg:passlist:embed-rejected') {
    return show(interaction, editor.editorPayload('passlistRejectedPublic', 'Anúncio de reprovado', 'cfg:passlist:public-log'));
  }
  if (id === 'cfg:passlist:publish') {
    const d = store.load();
    if (!d.passlist.staffChannelId || !d.passlist.pendingRoleId || !d.passlist.approvedRoleId) {
      await interaction.reply({
        embeds: [error('Defina canal da staff e os dois cargos antes de publicar.')],
        ephemeral: true,
      });
      return;
    }
    if (!d.passlist.panelChannelId) {
      await interaction.reply({ embeds: [error('Escolha o canal do formulário primeiro.')], ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(d.passlist.panelChannelId).catch(() => null);
    if (!channel) {
      await interaction.reply({ embeds: [error('Canal do formulário inválido.')], ephemeral: true });
      return;
    }
    const message = await channel.send(passlist.buildPanel(d));
    store.update((s) => {
      s.passlist.panelMessageId = message.id;
    });
    await interaction.reply({ embeds: [success(`Painel da passlist publicado em ${channel}.`)], ephemeral: true });
    return;
  }
  if (id === 'cfg:passlist:publish-release') {
    const d = store.load();
    if (!d.passlist.releaseChannelId) {
      await interaction.reply({ embeds: [error('Escolha o canal de liberar ID primeiro.')], ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(d.passlist.releaseChannelId).catch(() => null);
    if (!channel) {
      await interaction.reply({ embeds: [error('Canal de liberar ID inválido.')], ephemeral: true });
      return;
    }
    const message = await channel.send(passlist.buildReleasePanel(d));
    store.update((s) => {
      s.passlist.releaseMessageId = message.id;
    });
    await interaction.reply({ embeds: [success(`Painel de ID publicado em ${channel}.`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ingame:embed') {
    return show(interaction, editor.editorPayload('ingamePanel', 'Painel in-game', 'cfg:mod:ingame'));
  }
  if (id === 'cfg:ingame:ban-log') return show(interaction, ingameBanLogView());
  if (id === 'cfg:ingame:roles') return show(interaction, ingameRolesView());
  if (id === 'cfg:ingame:embed-ban') {
    return show(interaction, editor.editorPayload('ingameBanLog', 'Log público de ban', 'cfg:ingame:ban-log'));
  }
  if (id === 'cfg:ingame:embed-unban') {
    return show(interaction, editor.editorPayload('ingameUnbanLog', 'Log público de desban', 'cfg:ingame:ban-log'));
  }
  if (id === 'cfg:ingame:embed-warn') {
    return show(interaction, editor.editorPayload('ingameWarnLog', 'Log público de advertência', 'cfg:ingame:ban-log'));
  }
  if (id === 'cfg:ingame:embed-unwarn') {
    return show(interaction, editor.editorPayload('ingameUnwarnLog', 'Log público de tirar advertência', 'cfg:ingame:ban-log'));
  }
  if (id === 'cfg:ingame:publish') return show(interaction, ingamePublishView());
  if (id === 'cfg:ingame:bridge') return show(interaction, ingameBridgeView());
  if (id === 'cfg:ingame:bridge-edit') {
    const current = store.load().commands;
    const modal = new ModalBuilder().setCustomId('cfg:ingame-bridge').setTitle('Ponte FiveM');
    const url = new TextInputBuilder()
      .setCustomId('url')
      .setLabel('URL do FiveM (porta do jogo)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setPlaceholder('http://IP:30120');
    if (current.fivemUrl) url.setValue(String(current.fivemUrl).slice(0, 100));
    const resource = new TextInputBuilder()
      .setCustomId('resource')
      .setLabel('Resource')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80)
      .setPlaceholder('sunville_bridge');
    if (current.fivemResource) resource.setValue(String(current.fivemResource).slice(0, 80));
    const token = new TextInputBuilder()
      .setCustomId('token')
      .setLabel('Token da ponte (vazio = manter)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(200)
      .setPlaceholder('Deixe vazio para manter o token atual');
    modal.addComponents(
      new ActionRowBuilder().addComponents(url),
      new ActionRowBuilder().addComponents(resource),
      new ActionRowBuilder().addComponents(token),
    );
    await interaction.showModal(modal);
    return;
  }

  if (id === 'cfg:ponto:embeds') return show(interaction, timeclockEmbedsView());
  if (id === 'cfg:ponto:embed-panel') {
    return show(interaction, editor.editorPayload('timeclockPanel', 'Painel de ponto', 'cfg:ponto:embeds'));
  }
  if (id === 'cfg:ponto:embed-rank') {
    return show(interaction, editor.editorPayload('timeclockRank', 'Rank de ponto', 'cfg:ponto:embeds'));
  }
  if (id === 'cfg:ponto:embed-weekly') {
    return show(interaction, editor.editorPayload('timeclockWeekly', 'Log semanal de ponto', 'cfg:ponto:embeds'));
  }
  if (id === 'cfg:ponto:embed-start') {
    return show(interaction, editor.editorPayload('timeclockStart', 'Log de início de ponto', 'cfg:ponto:logs'));
  }
  if (id === 'cfg:ponto:embed-stop') {
    return show(interaction, editor.editorPayload('timeclockStop', 'Log de fim de ponto', 'cfg:ponto:logs'));
  }
  if (id === 'cfg:ponto:logs') return show(interaction, timeclockLogsView());
  if (id === 'cfg:ponto:publish') return show(interaction, pontoPublishView('panel'));
  if (id === 'cfg:ponto:publish-rank') return show(interaction, pontoPublishView('rank'));
  if (id === 'cfg:ponto:clearrole') {
    store.update((s) => {
      s.timeclock.roleId = '';
    });
    return show(interaction, timeclockView());
  }
  if (id === 'cfg:ponto:horario') {
    const { describeReset } = require('../ingame/timeclock/time');
    const current = store.load().timeclock;
    const modal = new ModalBuilder().setCustomId('cfg:ponto-horario').setTitle('Horário do bate-ponto');
    const fuso = new TextInputBuilder()
      .setCustomId('fuso')
      .setLabel('Fuso IANA')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(80)
      .setPlaceholder('America/Sao_Paulo');
    if (current.timezone) fuso.setValue(String(current.timezone).slice(0, 80));
    const reinicio = new TextInputBuilder()
      .setCustomId('reinicio')
      .setLabel('Reinício da semana')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(40)
      .setPlaceholder('sábado 00:01');
    reinicio.setValue(describeReset().slice(0, 40));
    modal.addComponents(
      new ActionRowBuilder().addComponents(fuso),
      new ActionRowBuilder().addComponents(reinicio),
    );
    await interaction.showModal(modal);
    return;
  }

  if (id === 'cfg:calls:staff') return show(interaction, callsStaffView(interaction.guild));
  if (id === 'cfg:calls:embed') {
    return show(interaction, editor.editorPayload('callsLog', 'Log da call automática', 'cfg:mod:calls'));
  }
  if (id === 'cfg:calls:log') {
    return show(interaction, {
      embeds: [fromVisual({
        title: '🎧 Canal de log das calls',
        description: `Atual: ${chan(store.load().calls.logChannelId)}\n\nEste canal recebe um embed sempre que uma call de atendimento é criada.`,
        color: colors.gold,
      })],
      components: [
        textChannelSelect('cfg:ch:calls-log', 'Canal de log das calls'),
        backRow('cfg:mod:calls'),
      ],
    });
  }
  if (id === 'cfg:calls:prefix') {
    const current = store.load().calls.namePrefix || 'Atendimento';
    const modal = new ModalBuilder().setCustomId('cfg:calls-prefix').setTitle('Nome da call');
    const input = new TextInputBuilder()
      .setCustomId('prefix')
      .setLabel('Prefixo (ex: Atendimento)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(40)
      .setValue(String(current).slice(0, 40));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (id === 'cfg:antilink:embed') {
    return show(interaction, editor.editorPayload('antilinkWarn', 'Aviso de anti-link', 'cfg:mod:antilink'));
  }
  if (id === 'cfg:rename:toggle') {
    store.update((s) => {
      s.rename.enabled = !s.rename.enabled;
    });
    return show(interaction, renameView(interaction.guild));
  }
  if (id === 'cfg:rename:sync') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await rename.syncAll(interaction.client);
      await interaction.editReply({
        embeds: [success(`Sincronização concluída. Alterados: **${result.ok}**. Sem Discord/nome: **${result.wait}**. Falhas: **${result.fail}**.`)],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [error(err.message)] });
    }
    return;
  }
  if (id === 'cfg:antilink:toggle') {
    store.update((s) => {
      s.antilink.enabled = !s.antilink.enabled;
    });
    return show(interaction, antilinkView(interaction.guild));
  }
  if (id === 'cfg:antilink:clear-roles') {
    store.update((s) => {
      s.antilink.allowedRoles = [];
    });
    return show(interaction, antilinkView(interaction.guild));
  }
  if (id === 'cfg:antilink:clear-channels') {
    store.update((s) => {
      s.antilink.allowedChannels = [];
    });
    return show(interaction, antilinkView(interaction.guild));
  }
  if (id === 'cfg:antilink:domains') {
    const current = (store.load().antilink.allowedDomains || []).join('\n');
    const modal = new ModalBuilder().setCustomId('cfg:antilink-domains').setTitle('Domínios permitidos');
    const input = new TextInputBuilder()
      .setCustomId('domains')
      .setLabel('Um domínio por linha (ex: youtube.com)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000)
      .setPlaceholder('youtube.com\ntwitter.com');
    if (current) input.setValue(current.slice(0, 1000));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }
}

async function handleNav(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const value = interaction.values[0];
  await show(interaction, moduleView(value, interaction.user.id, interaction.guild));
}

async function handleStringSelect(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const id = interaction.customId;
  const userId = interaction.user.id;

  if (id === 'cfg:nav') return handleNav(interaction);
  if (id.startsWith('cfg:msg:')) return composer.handleStringSelect(interaction);
  if (id === 'cfg:passlist-q-pick') {
    const value = interaction.values[0];
    if (value && value !== 'none') setPending(userId, { passlistQuestionId: value });
    return show(interaction, passlistQuestionsView(userId));
  }

  if (id === 'cfg:ticket-cat') {
    setPending(userId, { categoryId: interaction.values[0] });
    return show(interaction, ticketsView(getPending(userId)));
  }

  if (id === 'cfg:staff-del') {
    store.update((s) => {
      s.tickets.staffRoles = s.tickets.staffRoles.filter((roleId) => roleId !== interaction.values[0]);
    });
    return show(interaction, ticketsStaffView(interaction.guild, getPending(userId)));
  }

  if (id === 'cfg:cat-staff-del') {
    const catId = getPending(userId).categoryId;
    store.update((s) => {
      const cat = s.tickets.categories.find((c) => c.id === catId);
      if (!cat) return;
      if (!Array.isArray(cat.staffRoles)) cat.staffRoles = [];
      cat.staffRoles = cat.staffRoles.filter((roleId) => roleId !== interaction.values[0]);
    });
    return show(interaction, ticketsStaffView(interaction.guild, getPending(userId)));
  }

  if (id === 'cfg:hierarchy-del') {
    store.update((s) => {
      s.hierarchy.roles = s.hierarchy.roles.filter((roleId) => roleId !== interaction.values[0]);
    });
    await hierarchy.refreshMessage(interaction.client);
    return show(interaction, hierarchyView(interaction.guild));
  }

  if (id === 'cfg:calls-staff-del') {
    store.update((s) => {
      s.calls.staffRoles = (s.calls.staffRoles || []).filter((roleId) => roleId !== interaction.values[0]);
    });
    return show(interaction, callsStaffView(interaction.guild));
  }

  if (id === 'cfg:rename-skip-del') {
    store.update((s) => {
      s.rename.skipRoles = (s.rename.skipRoles || []).filter((roleId) => roleId !== interaction.values[0]);
    });
    return show(interaction, renameView(interaction.guild));
  }
}

async function handleChannelSelect(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  if (interaction.customId.startsWith('cfg:msg:')) return composer.handleChannelSelect(interaction);
  const id = interaction.customId;
  const channel = interaction.channels.first();
  if (!channel) return;

  if (id === 'cfg:ch:tickets-publish') {
    const data = store.load();
    const message = await channel.send(tickets.buildPanel(data));
    store.update((s) => {
      s.tickets.panelChannelId = channel.id;
      s.tickets.panelMessageId = message.id;
    });
    await show(interaction, ticketsView(getPending(interaction.user.id)));
    await interaction.followUp({ embeds: [success(`Painel de tickets publicado em ${channel}.`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:ticket-log') {
    store.update((s) => {
      s.tickets.logChannelId = channel.id;
    });
    return show(interaction, ticketsView(getPending(interaction.user.id)));
  }

  if (id === 'cfg:ch:ticket-rating') {
    store.update((s) => {
      s.tickets.ratingChannelId = channel.id;
    });
    return show(interaction, ticketsExtraView());
  }

  if (id === 'cfg:ch:ticket-rank') {
    store.update((s) => {
      s.tickets.rankChannelId = channel.id;
    });
    const message = await require('./ticket-rank').publishRank(channel);
    await show(interaction, ticketsExtraView());
    await interaction.followUp({ embeds: [success(`Rank de tickets publicado em ${channel}. [Abrir](${message.url})`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:cat-parent') {
    const catId = getPending(interaction.user.id).categoryId;
    store.update((s) => {
      const cat = s.tickets.categories.find((c) => c.id === catId);
      if (cat) cat.discordCategoryId = channel.id;
    });
    return show(interaction, ticketsView(getPending(interaction.user.id)));
  }

  if (id === 'cfg:ch:hierarchy-publish') {
    await interaction.deferUpdate();
    await interaction.guild.members.fetch().catch(() => {});
    const data = store.load();
    const message = await channel.send({ embeds: hierarchy.buildEmbeds(interaction.guild, data) });
    store.update((s) => {
      s.hierarchy.channelId = channel.id;
      s.hierarchy.messageId = message.id;
    });
    await interaction.editReply(hierarchyView(interaction.guild));
    await interaction.followUp({ embeds: [success(`Hierarquia publicada em ${channel}.`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:fivem-publish') {
    const data = store.load();
    const message = await channel.send(fivem.buildPanel(data));
    store.update((s) => {
      s.fivem.channelId = channel.id;
      s.fivem.messageId = message.id;
    });
    await show(interaction, fivemView());
    await interaction.followUp({ embeds: [success(`Conexão publicada em ${channel}.`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:suggest-panel') {
    store.update((s) => {
      s.suggestions.panelChannelId = channel.id;
    });
    return show(interaction, suggestionsView());
  }

  if (id === 'cfg:ch:suggest-review') {
    store.update((s) => {
      s.suggestions.reviewChannelId = channel.id;
    });
    return show(interaction, suggestionsView());
  }

  if (id === 'cfg:ch:verify-publish') {
    store.update((s) => {
      s.verification.panelChannelId = channel.id;
    });
    return show(interaction, verificationView());
  }

  if (id === 'cfg:ch:passlist-panel') {
    store.update((s) => {
      s.passlist.panelChannelId = channel.id;
    });
    return show(interaction, passlistView());
  }

  if (id === 'cfg:ch:passlist-staff') {
    store.update((s) => {
      s.passlist.staffChannelId = channel.id;
    });
    return show(interaction, passlistView());
  }

  if (id === 'cfg:ch:passlist-release') {
    store.update((s) => {
      s.passlist.releaseChannelId = channel.id;
    });
    return show(interaction, passlistView());
  }

  if (id === 'cfg:ch:passlist-public-log') {
    store.update((s) => {
      s.passlist.publicLogChannelId = channel.id;
    });
    return show(interaction, passlistPublicLogView());
  }

  if (id === 'cfg:ch:passlist-interview') {
    store.update((s) => {
      s.passlist.interviewCategoryId = channel.id;
    });
    return show(interaction, passlistQuestionsView(interaction.user.id));
  }

  if (id === 'cfg:ch:logs') {
    store.update((s) => {
      s.logs.channelId = channel.id;
    });
    return show(interaction, logsView());
  }

  if (id === 'cfg:ch:rename-log') {
    store.update((s) => {
      s.rename.logChannelId = channel.id;
    });
    return show(interaction, renameView(interaction.guild));
  }

  if (id === 'cfg:ch:backup') {
    store.update((s) => {
      s.backup.channelId = channel.id;
    });
    return show(interaction, backupView());
  }

  if (id === 'cfg:ch:ingame-log') {
    store.update((s) => {
      s.commands.logChannelId = channel.id;
    });
    return show(interaction, ingameView());
  }

  if (id === 'cfg:ch:ingame-ban-log') {
    store.update((s) => {
      s.commands.banLogChannelId = channel.id;
    });
    return show(interaction, ingameBanLogView());
  }

  if (id === 'cfg:ch:ingame-panel') {
    store.update((s) => {
      s.commands.panelChannelId = channel.id;
    });
    return show(interaction, ingameView());
  }

  if (id === 'cfg:ch:ingame-publish') {
    const { fixPanelInChannel } = require('../ingame/panels/fixed');
    const message = await fixPanelInChannel(channel);
    await show(interaction, ingameView());
    await interaction.followUp({ embeds: [success(`Painel in-game publicado em ${channel}. [Abrir](${message.url})`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:ponto-panel') {
    const { publishPanel } = require('../ingame/timeclock/service');
    const message = await publishPanel(channel);
    await show(interaction, timeclockView());
    await interaction.followUp({ embeds: [success(`Bate-ponto publicado em ${channel}. [Abrir](${message.url})`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:ponto-rank') {
    const { publishRank } = require('../ingame/timeclock/service');
    const message = await publishRank(channel);
    await show(interaction, timeclockView());
    await interaction.followUp({ embeds: [success(`Rank publicado em ${channel}. [Abrir](${message.url})`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:ponto-publish') {
    const { publishPanel } = require('../ingame/timeclock/service');
    const message = await publishPanel(channel);
    await show(interaction, timeclockView());
    await interaction.followUp({ embeds: [success(`Bate-ponto publicado em ${channel}. [Abrir](${message.url})`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:ponto-publish-rank') {
    const { publishRank } = require('../ingame/timeclock/service');
    const message = await publishRank(channel);
    await show(interaction, timeclockView());
    await interaction.followUp({ embeds: [success(`Rank publicado em ${channel}. [Abrir](${message.url})`)], ephemeral: true });
    return;
  }

  if (id === 'cfg:ch:ponto-log') {
    store.update((s) => {
      s.timeclock.logChannelId = channel.id;
    });
    return show(interaction, timeclockLogsView());
  }

  if (id === 'cfg:ch:ponto-weekly') {
    store.update((s) => {
      s.timeclock.weeklyLogChannelId = channel.id;
    });
    return show(interaction, timeclockLogsView());
  }

  if (id === 'cfg:ch:calls-lobby') {
    store.update((s) => {
      s.calls.lobbyChannelId = channel.id;
    });
    return show(interaction, callsView(interaction.guild));
  }

  if (id === 'cfg:ch:calls-folder') {
    store.update((s) => {
      s.calls.categoryId = channel.id;
    });
    return show(interaction, callsView(interaction.guild));
  }

  if (id === 'cfg:ch:calls-log') {
    store.update((s) => {
      s.calls.logChannelId = channel.id;
    });
    return show(interaction, callsView(interaction.guild));
  }

  if (id === 'cfg:ch:antilink') {
    store.update((s) => {
      if (!Array.isArray(s.antilink.allowedChannels)) s.antilink.allowedChannels = [];
      if (!s.antilink.allowedChannels.includes(channel.id)) s.antilink.allowedChannels.push(channel.id);
    });
    return show(interaction, antilinkView(interaction.guild));
  }
}

async function handleRoleSelect(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const id = interaction.customId;
  const roles = [...interaction.roles.values()];

  if (id === 'cfg:role:ticket-staff') {
    store.update((s) => {
      for (const r of roles) {
        if (!s.tickets.staffRoles.includes(r.id)) s.tickets.staffRoles.push(r.id);
      }
    });
    return show(interaction, ticketsStaffView(interaction.guild, getPending(interaction.user.id)));
  }

  if (id === 'cfg:role:cat-staff') {
    const catId = getPending(interaction.user.id).categoryId;
    store.update((s) => {
      const cat = s.tickets.categories.find((c) => c.id === catId);
      if (!cat) return;
      if (!Array.isArray(cat.staffRoles)) cat.staffRoles = [];
      for (const r of roles) {
        if (!cat.staffRoles.includes(r.id)) cat.staffRoles.push(r.id);
      }
    });
    return show(interaction, ticketsStaffView(interaction.guild, getPending(interaction.user.id)));
  }

  if (id === 'cfg:role:hierarchy-add') {
    store.update((s) => {
      for (const r of roles) {
        if (!s.hierarchy.roles.includes(r.id)) s.hierarchy.roles.push(r.id);
      }
    });
    await hierarchy.refreshMessage(interaction.client);
    return show(interaction, hierarchyView(interaction.guild));
  }

  if (id === 'cfg:role:verify') {
    store.update((s) => {
      s.verification.roleId = roles[0].id;
    });
    return show(interaction, verificationView());
  }

  if (id === 'cfg:role:passlist-pending') {
    store.update((s) => {
      s.passlist.pendingRoleId = roles[0].id;
    });
    return show(interaction, passlistRolesView());
  }

  if (id === 'cfg:role:passlist-approved') {
    store.update((s) => {
      s.passlist.approvedRoleId = roles[0].id;
    });
    return show(interaction, passlistRolesView());
  }

  if (id === 'cfg:role:ingame-staff') {
    store.update((s) => {
      s.commands.staffRoleId = roles[0].id;
    });
    return show(interaction, ingameView());
  }

  if (id === 'cfg:role:ingame-ban') {
    store.update((s) => {
      s.commands.banRoleId = roles[0].id;
    });
    return show(interaction, ingameRolesView());
  }

  if (id === 'cfg:role:ingame-warn1') {
    store.update((s) => {
      s.commands.warnRole1Id = roles[0].id;
    });
    return show(interaction, ingameRolesView());
  }

  if (id === 'cfg:role:ingame-warn2') {
    store.update((s) => {
      s.commands.warnRole2Id = roles[0].id;
    });
    return show(interaction, ingameRolesView());
  }

  if (id === 'cfg:role:ingame-warn3') {
    store.update((s) => {
      s.commands.warnRole3Id = roles[0].id;
    });
    return show(interaction, ingameRolesView());
  }

  if (id === 'cfg:role:rename-skip') {
    store.update((s) => {
      if (!Array.isArray(s.rename.skipRoles)) s.rename.skipRoles = [];
      for (const r of roles) {
        if (!s.rename.skipRoles.includes(r.id)) s.rename.skipRoles.push(r.id);
      }
    });
    return show(interaction, renameView(interaction.guild));
  }

  if (id === 'cfg:role:ponto') {
    store.update((s) => {
      s.timeclock.roleId = roles[0].id;
    });
    return show(interaction, timeclockView());
  }

  if (id === 'cfg:role:calls-privileged') {
    store.update((s) => {
      s.calls.privilegedRoleId = roles[0].id;
    });
    return show(interaction, callsView(interaction.guild));
  }

  if (id === 'cfg:role:calls-staff') {
    store.update((s) => {
      if (!Array.isArray(s.calls.staffRoles)) s.calls.staffRoles = [];
      for (const r of roles) {
        if (!s.calls.staffRoles.includes(r.id)) s.calls.staffRoles.push(r.id);
      }
    });
    return show(interaction, callsStaffView(interaction.guild));
  }

  if (id === 'cfg:role:antilink') {
    store.update((s) => {
      if (!Array.isArray(s.antilink.allowedRoles)) s.antilink.allowedRoles = [];
      for (const r of roles) {
        if (!s.antilink.allowedRoles.includes(r.id)) s.antilink.allowedRoles.push(r.id);
      }
    });
    return show(interaction, antilinkView(interaction.guild));
  }
}

async function handleModal(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  if (interaction.customId.startsWith('cfg:msg:')) return composer.handleModal(interaction);
  const id = interaction.customId;

  if (id === 'cfg:cat-add' || id.startsWith('cfg:cat-edit:')) {
    const nome = interaction.fields.getTextInputValue('nome').trim();
    const descricao = interaction.fields.getTextInputValue('descricao').trim();
    const emoji = tickets.storedEmoji(interaction.fields.getTextInputValue('emoji'));
    const inicio = interaction.fields.getTextInputValue('inicio').trim();

    if (id === 'cfg:cat-add') {
      store.update((s) => {
        if (s.tickets.categories.length >= 25) return;
        s.tickets.categories.push({
          id: `${slug(nome)}-${Date.now().toString(36)}`,
          label: nome,
          description: descricao,
          emoji,
          startMessage: inicio,
          discordCategoryId: null,
          staffRoles: [],
        });
      });
    } else {
      const catId = id.slice('cfg:cat-edit:'.length);
      store.update((s) => {
        const cat = s.tickets.categories.find((c) => c.id === catId);
        if (!cat) return;
        cat.label = nome;
        cat.description = descricao;
        cat.emoji = emoji;
        cat.startMessage = inicio;
      });
    }
    await editor.refreshPublished(interaction.client, 'tickets');
    return show(interaction, ticketsView(getPending(interaction.user.id)));
  }

  if (id === 'cfg:fivem-url') {
    const url = interaction.fields.getTextInputValue('url').trim();
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
    await editor.refreshPublished(interaction.client, 'fivem');
    return show(interaction, fivemView());
  }

  if (id === 'cfg:passlist-q-add' || id === 'cfg:passlist-q-edit') {
    const prompt = interaction.fields.getTextInputValue('prompt').trim();
    if (!prompt) {
      await interaction.reply({ embeds: [error('Escreva a pergunta.')], ephemeral: true });
      return;
    }
    if (id === 'cfg:passlist-q-add') {
      const item = { id: `q-${Date.now().toString(36)}`, prompt };
      store.update((s) => {
        if (!Array.isArray(s.passlist.questions)) s.passlist.questions = [];
        if (s.passlist.questions.length >= 20) return;
        s.passlist.questions.push(item);
      });
      setPending(interaction.user.id, { passlistQuestionId: item.id });
    } else {
      const selected = getPending(interaction.user.id).passlistQuestionId;
      store.update((s) => {
        const found = (s.passlist.questions || []).find((item) => item.id === selected);
        if (found) found.prompt = prompt;
      });
    }
    return show(interaction, passlistQuestionsView(interaction.user.id));
  }

  if (id === 'cfg:ingame-bridge') {
    const url = interaction.fields.getTextInputValue('url').trim().replace(/\/$/, '');
    const resource = interaction.fields.getTextInputValue('resource').trim();
    const token = interaction.fields.getTextInputValue('token').trim();
    if (!url || !resource) {
      await interaction.reply({ embeds: [error('Preencha URL e resource.')], ephemeral: true });
      return;
    }
    store.update((s) => {
      s.commands.fivemUrl = url;
      s.commands.fivemResource = resource;
      if (token) s.commands.fivemToken = token;
    });
    return show(interaction, ingameBridgeView());
  }

  if (id === 'cfg:ponto-horario') {
    const fuso = interaction.fields.getTextInputValue('fuso').trim();
    const reinicio = interaction.fields.getTextInputValue('reinicio').trim();
    try {
      Intl.DateTimeFormat('en-US', { timeZone: fuso }).format(new Date());
    } catch {
      await interaction.reply({ embeds: [error('Fuso inválido. Ex: America/Sao_Paulo')], ephemeral: true });
      return;
    }
    const { parseResetSpec } = require('../ingame/timeclock/time');
    const parsed = parseResetSpec(reinicio);
    if (!parsed) {
      await interaction.reply({ embeds: [error('Reinício inválido. Ex: sábado 00:01')], ephemeral: true });
      return;
    }
    store.update((s) => {
      s.timeclock.timezone = fuso;
      s.timeclock.resetWeekday = parsed.weekday;
      s.timeclock.resetHour = parsed.hour;
      s.timeclock.resetMinute = parsed.minute;
    });
    return show(interaction, timeclockView());
  }

  if (id === 'cfg:calls-prefix') {
    const prefix = interaction.fields.getTextInputValue('prefix').trim() || 'Atendimento';
    store.update((s) => {
      s.calls.namePrefix = prefix.slice(0, 40);
    });
    return show(interaction, callsView(interaction.guild));
  }

  if (id === 'cfg:antilink-domains') {
    const raw = interaction.fields.getTextInputValue('domains') || '';
    const domains = [...new Set(raw.split(/[\n,;]+/).map((item) => {
      return item.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
    }).filter(Boolean))];
    store.update((s) => {
      s.antilink.allowedDomains = domains;
    });
    return show(interaction, antilinkView(interaction.guild));
  }
}

module.exports = {
  open,
  navSelect,
  handleButton,
  handleStringSelect,
  handleChannelSelect,
  handleRoleSelect,
  handleModal,
};
