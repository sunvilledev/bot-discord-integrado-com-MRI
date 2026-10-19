const fs = require('fs');
const path = require('path');
const { adminRoleId, colors } = require('./config');

const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'guild.json');

const defaults = {
  tickets: {
    embed: {
      title: '🎫 Central de Tickets — Sunville',
      description:
        'Precisa de ajuda? Escolha abaixo o tipo de atendimento.\n\n' +
        'Um canal privado será aberto só para você e a staff.\n' +
        'Seja claro no relato para agilizar o suporte.',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville Roleplay • MRI QBCore',
    },
    panelChannelId: null,
    panelMessageId: null,
    logChannelId: null,
    ratingChannelId: null,
    rankChannelId: null,
    rankMessageId: null,
    rankEmbed: {
      title: 'Sunville • Rank de tickets assumidos',
      description:
        'Período: **{periodo}**\n' +
        'Reinicia todo **{reset}**.\n' +
        'Registros ficam 30 dias no banco e depois são apagados.\n\n' +
        '{lista}',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Rank de tickets',
    },
    rankClosedEmbed: {
      title: 'Sunville • Rank de tickets • semana encerrada',
      description:
        'Semana encerrada: **{periodo}**\n' +
        'Próximo reset: **{reset}**.\n\n' +
        '{lista}',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Snapshot semanal de tickets',
    },
    closeDmEmbed: {
      title: 'Seu ticket foi fechado',
      description:
        'O ticket **#{ticket}** ({categoria}) foi finalizado por {closer}.\n\n' +
        'O transcript completo está neste anexo. Guarde se precisar.\n\n' +
        'Avalie o atendimento de {staff} pelos botões abaixo.',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville Roleplay • Tickets',
    },
    ratingLogEmbed: {
      title: 'Avaliação • Ticket #{ticket}',
      description: 'Nota: **{nota}**',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Avaliação de ticket',
    },
    staffRoles: [adminRoleId],
    counter: 0,
    open: {},
    categories: [
      {
        id: 'suporte',
        label: 'Suporte',
        description: 'Problemas técnicos, contas e dúvidas gerais',
        emoji: '🛠️',
        discordCategoryId: null,
        staffRoles: [],
        startMessage:
          'Olá {user}!\n\nVocê abriu um ticket de **Suporte**.\nDescreva o problema, envie prints se possível e aguarde a staff.',
      },
      {
        id: 'denuncia',
        label: 'Denúncia',
        description: 'Reportar jogadores ou quebra de regras',
        emoji: '🚨',
        discordCategoryId: null,
        staffRoles: [],
        startMessage:
          'Olá {user}!\n\nVocê abriu um ticket de **Denúncia**.\nInforme ID/Discord do acusado, o que aconteceu, horário e provas.',
      },
      {
        id: 'duvidas',
        label: 'Dúvidas',
        description: 'Perguntas sobre a cidade, regras e sistemas',
        emoji: '❓',
        discordCategoryId: null,
        staffRoles: [],
        startMessage:
          'Olá {user}!\n\nVocê abriu um ticket de **Dúvidas**.\nConte o que precisa entender — a staff responde o mais breve possível.',
      },
      {
        id: 'vip',
        label: 'VIP / Doações',
        description: 'Compras, benefícios e pagamentos',
        emoji: '💎',
        discordCategoryId: null,
        staffRoles: [],
        startMessage:
          'Olá {user}!\n\nVocê abriu um ticket de **VIP / Doações**.\nInforme o pacote desejado e o comprovante, se já tiver pago.',
      },
    ],
  },
  hierarchy: {
    embed: {
      title: '⭐ Hierarquia Staff — Sunville',
      description: '',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Atualizado automaticamente a cada 1 hora',
    },
    channelId: null,
    messageId: null,
    roles: [],
  },
  fivem: {
    embed: {
      title: '🎮 Conexão FiveM — Sunville',
      description:
        'Entre na cidade em poucos passos:\n\n' +
        '**1.** Abra o FiveM\n' +
        '**2.** Pressione `F8`\n' +
        '**3.** Digite `connect cfx.re/join/SEU_CODIGO`\n' +
        '**4.** Aguarde o carregamento e divirta-se\n\n' +
        'Sem whitelist aprovada você não consegue entrar.\n' +
        'Base: **MRI QBCore**',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville Roleplay',
    },
    connectUrl: '',
    channelId: null,
    messageId: null,
  },
  suggestions: {
    embed: {
      title: '💡 Caixa de Sugestões',
      description:
        'Tem uma ideia para melhorar a Sunville?\n' +
        'Clique no botão abaixo, descreva com clareza e a cidade vota.',
      color: colors.info,
      image: '',
      thumbnail: '',
      footer: 'Sugestões da comunidade',
    },
    panelChannelId: null,
    panelMessageId: null,
    reviewChannelId: null,
    votes: {},
  },
  verification: {
    embed: {
      title: '✅ Verificação',
      description:
        'Para acessar o servidor, clique em **Verificar**.\n\n' +
        'Uma mensagem só sua vai aparecer com **10 códigos**.\n' +
        'Selecione o código que o bot mostrou para receber o cargo.',
      color: colors.success,
      image: '',
      thumbnail: '',
      footer: 'Anti-bot • Sunville',
    },
    panelChannelId: null,
    panelMessageId: null,
    roleId: null,
  },
  passlist: {
    embed: {
      title: '📋 Passlist — Sunville',
      description:
        'Para jogar na Sunville você precisa estar na **passlist**.\n\n' +
        '**Como funciona**\n' +
        '1. Clique em **Enviar formulário** — um canal privado abre só com você e o bot\n' +
        '2. Responda as perguntas no chat, uma de cada vez\n' +
        '3. Ao terminar, o canal fecha em 30 segundos e a staff analisa\n' +
        '4. Se for aprovado, você recebe um cargo e acessa o canal de **liberar ID**\n' +
        '5. Tente conectar no FiveM uma vez (gera a conta) e copie a **license** da tela de kick\n' +
        '6. Clique em **Liberar meu ID** e cole a license — ou peça para a staff te marcar / colar a license\n\n' +
        'Sem `users.passlist = 1`, a conexão é recusada — inclusive para admin.',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville Roleplay • Passlist',
    },
    releaseEmbed: {
      title: '🔑 Liberar ID — FiveM',
      description:
        'Sua whitelist foi **aprovada**. Agora libere sua conta na tabela **users**.\n\n' +
        '1. Tente entrar no FiveM uma vez (pode recusar) — copie a **license** da tela de kick\n' +
        '2. Volte aqui e clique em **Liberar meu ID** — cole a **license** da tela de kick\n\n' +
        'A staff também pode te liberar marcando você ou colando a **license** da tela de kick: `/passlist add`.',
      color: colors.success,
      image: '',
      thumbnail: '',
      footer: 'Sunville Roleplay • Passlist',
    },
    panelChannelId: null,
    panelMessageId: null,
    staffChannelId: null,
    releaseChannelId: null,
    releaseMessageId: null,
    publicLogChannelId: null,
    approvedPublicEmbed: {
      title: '✅ Passlist aprovada',
      description:
        '{user} (`{userTag}`) foi **aprovado** na passlist.\n\n' +
        'Nome IC: **{nome}**\n' +
        'Idade: **{idade}**\n' +
        'Staff: {staff}',
      color: colors.success,
      image: '',
      thumbnail: '',
      footer: 'Sunville Roleplay • Passlist',
    },
    rejectedPublicEmbed: {
      title: '❌ Passlist reprovada',
      description:
        '{user} (`{userTag}`) foi **reprovado** na passlist.\n\n' +
        'Motivo: **{motivo}**\n' +
        'Staff: {staff}',
      color: colors.error,
      image: '',
      thumbnail: '',
      footer: 'Sunville Roleplay • Passlist',
    },
    interviewCategoryId: null,
    interviews: {},
    questions: [
      { id: 'nome', prompt: 'Qual o nome do seu personagem (IC)?' },
      { id: 'idade', prompt: 'Qual a sua idade real?' },
      { id: 'experiencia', prompt: 'Há quanto tempo você joga RP?' },
      { id: 'motivo', prompt: 'Por que quer jogar na Sunville?' },
      { id: 'historico', prompt: 'Já foi banido em outro servidor? Se sim, explique. Se não, escreva Não.' },
    ],
    pendingRoleId: null,
    approvedRoleId: null,
  },
  backup: {
    enabled: true,
    channelId: null,
    intervalHours: 8,
    lastBackupAt: 0,
    lastFile: null,
    lastSize: 0,
    keepLocal: 7,
    embed: {
      title: '💾 Backup do banco FiveM',
      description:
        'Banco: **{banco}**\n' +
        'Arquivo: `{arquivo}`\n' +
        'Tamanho: **{tamanho}**\n' +
        'Tabelas: **{tabelas}**\n' +
        'Gerado: {quando}\n' +
        'Próximo backup: {proximo}',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Backup automático a cada 8 horas',
    },
  },
  logs: {
    channelId: null,
    joinEmbed: {
      title: '📥 Entrou no servidor',
      description: '{user} (`{tag}`)\nID: `{id}`\nConta criada: {conta}\nMembros: **{membros}**',
      color: colors.success,
      image: '',
      thumbnail: '',
      footer: 'Log de entrada e saída • separado dos tickets',
    },
    leaveEmbed: {
      title: '📤 Saiu do servidor',
      description: '{user} (`{tag}`)\nID: `{id}`\nCargos: {cargos}\nMembros: **{membros}**',
      color: colors.leave,
      image: '',
      thumbnail: '',
      footer: 'Log de entrada e saída • separado dos tickets',
    },
  },
  commands: {
    embed: {
      title: 'Sunville • Painel de comandos',
      description:
        'Selecione um comando nas listas abaixo.\n' +
        'Se precisar de ID ou outros dados, o formulário abre em seguida.\n\n' +
        '**{acoes} ações** disponíveis.',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • By: Sunville Dev',
    },
    staffRoleId: process.env.STAFF_ROLE_ID || null,
    logChannelId: process.env.LOG_CHANNEL_ID || null,
    banLogChannelId: null,
    banRoleId: null,
    warnRole1Id: null,
    warnRole2Id: null,
    warnRole3Id: null,
    unbanLogEmbed: {
      title: 'Desbanimento',
      description: '{jogador} foi desbanido.\n\nMotivo: **{motivo}**\nStaff: {staff}',
      color: colors.success,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Desbanimento',
    },
    warnLogEmbed: {
      title: '⚠️ Advertência',
      description: '{jogador} recebeu a **{nivelTexto}** ({nivel}/3).\n\nMotivo: **{motivo}**\nStaff: {staff}',
      color: colors.leave,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Advertência',
    },
    unwarnLogEmbed: {
      title: 'Advertência removida',
      description: '{jogador} agora está em **{nivel}/3**.\n\nMotivo: **{motivo}**\nStaff: {staff}',
      color: colors.success,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Advertência',
    },
    banLogEmbed: {
      title: '🔨 Jogador banido',
      description:
        '{staff} baniu **{jogador}** (`ID {playerId}`).\n\n' +
        'Motivo: **{motivo}**\n' +
        'Duração: **{duracaoTexto}**',
      color: colors.error,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Log público de ban',
    },
    panelChannelId: process.env.PANEL_CHANNEL_ID || null,
    panelMessageId: null,
    fivemUrl: (process.env.FIVEM_URL || process.env.FIVEM_ENDPOINT || 'http://127.0.0.1:30120').replace(/\/$/, ''),
    fivemResource: process.env.FIVEM_RESOURCE || 'sunville_bridge',
    fivemToken: process.env.FIVEM_TOKEN || '',
  },
  timeclock: {
    channelId: process.env.TIMECLOCK_CHANNEL_ID || null,
    rankChannelId: process.env.TIMECLOCK_RANK_CHANNEL_ID || null,
    logChannelId: null,
    weeklyLogChannelId: null,
    roleId: process.env.TIMECLOCK_ROLE_ID || null,
    timezone: process.env.TIMECLOCK_TIMEZONE || 'America/Sao_Paulo',
    resetWeekday: 6,
    resetHour: 0,
    resetMinute: 1,
    retentionDays: 31,
    lastWeeklyLogWeekStart: 0,
    embed: {
      title: 'Sunville • Bate-ponto',
      description:
        '**Iniciar** abre o ponto, **Finalizar** fecha, **Tempo** mostra seus totais.\n' +
        'A semana reinicia todo **{reset}** ({fuso}).\n' +
        'Registros com mais de 1 mês são apagados automaticamente.',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Tempo ao vivo • By: Sunville Dev',
    },
    rankEmbed: {
      title: 'Sunville • Rank da semana',
      description:
        'Período: **{periodo}**\n' +
        'Reinicia todo **{reset}**.\n\n' +
        '{lista}',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Atualizado a cada ponto fechado',
    },
    weeklyEmbed: {
      title: 'Sunville • Log do rank semanal',
      description:
        'Semana encerrada: **{periodo}**\n' +
        'Próximo reset: **{reset}**.\n\n' +
        '{lista}',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Snapshot semanal de ponto',
    },
    startEmbed: {
      title: 'Ponto iniciado',
      description: '{user} iniciou o bate-ponto.',
      color: colors.success,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Log de ponto',
    },
    stopEmbed: {
      title: 'Ponto finalizado',
      description: '{user} finalizou o bate-ponto.\nDuração da sessão: **{duracao}**',
      color: colors.error,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Log de ponto',
    },
  },
  calls: {
    lobbyChannelId: null,
    categoryId: null,
    privilegedRoleId: null,
    namePrefix: 'Atendimento',
    logChannelId: null,
    staffRoles: [],
    open: {},
    logEmbed: {
      title: '🎧 Call de atendimento criada',
      description: '{user} entrou na espera e ganhou a call {call}.',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Call automática',
    },
  },
  messages: {
    items: [],
  },
  rename: {
    enabled: true,
    logChannelId: null,
    skipRoles: [],
  },
  antilink: {
    enabled: false,
    allowedRoles: [],
    allowedChannels: [],
    allowedDomains: [],
    warnEmbed: {
      title: '🔗 Link bloqueado',
      description: '{user}, links não são permitidos neste canal.',
      color: colors.error,
      image: '',
      thumbnail: '',
      footer: 'Sunville • Anti-link',
    },
  },
};

function deepMerge(base, extra) {
  if (Array.isArray(base)) return extra ?? base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    for (const key of Object.keys(extra || {})) {
      out[key] = extra[key] !== undefined && extra[key] !== null && typeof extra[key] === 'object' && !Array.isArray(extra[key])
        ? deepMerge(base[key] ?? {}, extra[key])
        : extra[key];
    }
    return out;
  }
  return extra ?? base;
}

function ensureFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaults, null, 2), 'utf8');
  }
}

function load() {
  ensureFile();
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return deepMerge(defaults, raw);
}

function save(data) {
  ensureFile();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function update(mutator) {
  const data = load();
  const result = mutator(data);
  save(data);
  return result;
}

module.exports = { load, save, update, defaults };
