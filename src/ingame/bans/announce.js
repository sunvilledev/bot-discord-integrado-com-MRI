const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { brand } = require('../config');
const { IDS } = require('../panels/admin');
const store = require('../../store');
const { fromTemplate } = require('../../utils/embeds');
const { applyBanRole, removeBanRole, applyWarnRole, removeWarnRole } = require('./roles');

const proofWaiters = new Map();

function errorEmbed(message) {
  return new EmbedBuilder().setColor(brand.colorError).setTitle('Falha').setDescription(message);
}

function successEmbed(title, description) {
  return new EmbedBuilder().setColor(brand.colorSuccess).setTitle(title).setDescription(description).setTimestamp();
}

function extractLinks(text) {
  return [...String(text || '').matchAll(/https?:\/\/\S+/gi)]
    .map((match) => match[0].replace(/[)\]>.,]+$/g, ''))
    .filter(Boolean);
}

function collectProofsFromFields(fields = {}) {
  const links = [
    ...extractLinks(fields.proofs),
    ...(Array.isArray(fields.proofLinks) ? fields.proofLinks : []),
  ];
  return {
    links: [...new Set(links)],
    files: Array.isArray(fields.proofFiles) ? fields.proofFiles : [],
  };
}

function attachProofs(announce, fields) {
  const proofs = collectProofsFromFields(fields);
  announce.reason = announce.reason || fields.reason || '';
  announce.proofLinks = proofs.links;
  announce.proofFiles = proofs.files;
  return announce;
}

function proofLinksField(announce) {
  const links = announce.proofLinks || [];
  if (!links.length) return null;
  return { name: 'Provas', value: links.slice(0, 8).join('\n').slice(0, 1024), inline: false };
}

function withProofFields(embed, announce) {
  const field = proofLinksField(announce);
  if (field) embed.addFields(field);
  const firstImage = (announce.proofFiles || []).find((file) => String(file.contentType || '').startsWith('image/') && file.name);
  if (firstImage) embed.setImage(`attachment://${firstImage.name}`);
  return embed;
}

function extraProofEmbeds(announce) {
  return (announce.proofFiles || [])
    .filter((file) => String(file.contentType || '').startsWith('image/') && file.name)
    .slice(1, 4)
    .map((file) => new EmbedBuilder().setImage(`attachment://${file.name}`).setColor(0x2f3136));
}

function proofSendFiles(announce) {
  return (announce.proofFiles || [])
    .filter((file) => file.url)
    .slice(0, 8)
    .map((file) => ({ attachment: file.url, name: file.name || 'prova' }));
}

function announcePayload(embed, announce) {
  const embeds = [withProofFields(embed, announce), ...extraProofEmbeds(announce)];
  const files = proofSendFiles(announce);
  return files.length ? { embeds, files } : { embeds };
}

function proofButtons(includeConfirm = false) {
  const row = new ActionRowBuilder();
  if (includeConfirm) {
    row.addComponents(
      new ButtonBuilder().setCustomId(IDS.proofConfirm).setLabel('Sim, é só isso').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(IDS.proofMore).setLabel('Quero anexar mais').setStyle(ButtonStyle.Primary),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(IDS.proofSkip).setLabel('Continuar sem anexo').setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

function describeProofs(links, files) {
  const fileLines = files.map((file) => `• ${file.name}`).join('\n');
  const linkLines = links.map((link) => `• ${link}`).join('\n');
  return [
    files.length ? `**Arquivos (${files.length}):**\n${fileLines}` : null,
    links.length ? `**Links (${links.length}):**\n${linkLines}` : null,
    !files.length && !links.length ? 'Nada anexado ainda.' : null,
  ].filter(Boolean).join('\n\n').slice(0, 3900);
}

async function askProofConfirmation(waiter) {
  const payload = {
    embeds: [successEmbed('Confirmar provas', `${describeProofs(waiter.links, waiter.files)}\n\nÉ só isso que você quer anexar?`)],
    components: proofButtons(true),
  };
  if (waiter.confirmMessage) {
    await waiter.confirmMessage.edit(payload).catch(() => {});
    return;
  }
  if (waiter.dm) waiter.confirmMessage = await waiter.dm.send(payload).catch(() => null);
}

async function waitForProofs(interaction, fields) {
  collectProofsFromFields(fields);
  let dm = null;
  try {
    dm = await interaction.user.createDM();
    await dm.send({
      embeds: [successEmbed(
        'Anexar provas',
        'Envie **fotos, vídeos ou links** nesta conversa privada.\nQuando terminar, eu pergunto se é só isso.',
      )],
      components: proofButtons(false),
    });
    await interaction.editReply({
      embeds: [successEmbed('Provas', 'Te mandei uma mensagem no **privado**. Anexe as provas lá e confirme.')],
      components: proofButtons(false),
    });
  } catch {
    await interaction.editReply({
      embeds: [errorEmbed('Não consegui abrir seu privado. Libere DM com o bot ou continue sem anexo.')],
      components: proofButtons(false),
    });
  }

  return new Promise((resolve) => {
    const previous = proofWaiters.get(interaction.user.id);
    if (previous) previous.finish({ links: [], files: [] });

    const collector = dm
      ? dm.createMessageCollector({
        filter: (message) => message.author.id === interaction.user.id,
        time: 180000,
      })
      : null;

    const finish = (extra) => {
      const current = proofWaiters.get(interaction.user.id);
      if (!current || current.finish !== finish) return;
      proofWaiters.delete(interaction.user.id);
      clearTimeout(timer);
      collector?.stop('done');
      current.confirmMessage?.edit({ components: [] }).catch(() => {});
      resolve({ links: extra.links || [], files: extra.files || [] });
    };

    const timer = setTimeout(() => {
      const current = proofWaiters.get(interaction.user.id);
      finish({ links: current?.links || [], files: current?.files || [] });
    }, 180000);

    const waiter = {
      finish, collector, timer, dm, interaction, links: [], files: [], confirmMessage: null, waitingMore: true,
    };
    proofWaiters.set(interaction.user.id, waiter);

    collector?.on('collect', async (message) => {
      const files = [...message.attachments.values()].map((file) => ({
        url: file.url,
        name: file.name,
        contentType: file.contentType || '',
      }));
      const links = extractLinks(message.content);
      if (!files.length && !links.length) return;
      waiter.files.push(...files);
      waiter.links = [...new Set([...waiter.links, ...links])];
      waiter.waitingMore = false;
      await askProofConfirmation(waiter);
    });
  });
}

async function handleProofSkip(interaction) {
  const waiter = proofWaiters.get(interaction.user.id);
  if (!waiter) {
    await interaction.reply({ embeds: [errorEmbed('Nenhuma ação esperando prova.')], ephemeral: true });
    return;
  }
  await interaction.update({
    embeds: [successEmbed('Provas', 'Seguindo sem anexo.')],
    components: [],
  }).catch(() => {});
  waiter.finish({ links: [], files: [] });
}

async function handleProofConfirm(interaction) {
  const waiter = proofWaiters.get(interaction.user.id);
  if (!waiter) {
    await interaction.reply({ embeds: [errorEmbed('Nenhuma ação esperando prova.')], ephemeral: true });
    return;
  }
  await interaction.update({
    embeds: [successEmbed('Provas confirmadas', describeProofs(waiter.links, waiter.files))],
    components: [],
  }).catch(() => {});
  waiter.finish({ links: waiter.links, files: waiter.files });
}

async function handleProofMore(interaction) {
  const waiter = proofWaiters.get(interaction.user.id);
  if (!waiter) {
    await interaction.reply({ embeds: [errorEmbed('Nenhuma ação esperando prova.')], ephemeral: true });
    return;
  }
  waiter.waitingMore = true;
  await interaction.update({
    embeds: [successEmbed('Pode anexar mais', `${describeProofs(waiter.links, waiter.files)}\n\nEnvie mais fotos, vídeos ou links aqui no privado.`)],
    components: proofButtons(true),
  }).catch(() => {});
}

function parseIdentifier(value) {
  const text = String(value || '').trim();
  const mention = text.match(/^<@!?(\d+)>$/);
  const raw = (mention ? mention[1] : text).replace(/^discord:/i, '').trim();
  const isDiscord = /^\d{15,22}$/.test(raw);
  return {
    raw,
    discord: isDiscord ? `discord:${raw}` : '',
    citizenid: isDiscord ? '' : raw,
  };
}

function extractAnnounce(result) {
  return result?.result?.announce || result?.announce || result?.result?.result?.announce || null;
}

function parseDiscordMention(identifier) {
  const id = String(identifier || '').replace(/^discord:/, '');
  return id && /^\d{15,22}$/.test(id) ? `<@${id}>` : null;
}

function warnLabel(level) {
  if (level === 1) return '1ª advertência';
  if (level === 2) return '2ª advertência';
  if (level === 3) return '3ª advertência';
  return 'nenhuma';
}

function buildWarnAnnounce(action, fields, result) {
  const fromResult = extractAnnounce(result) || {};
  const parsed = parseIdentifier(fields.identifier || fields.playerId || fromResult.discord || fromResult.citizenid);
  const isRemove = action.id === 'remove_advertencia';
  return {
    ...fromResult,
    type: isRemove ? 'unwarn' : 'warn',
    name: fromResult.name || parsed.raw || 'Jogador',
    reason: fields.reason || fromResult.reason || 'Advertência da staff',
    playerId: fromResult.playerId || fields.playerId || '',
    citizenid: fromResult.citizenid || parsed.citizenid || '',
    license: fromResult.license || '',
    license2: fromResult.license2 || '',
    discord: fromResult.discord || parsed.discord || '',
  };
}

function banExpireFromDuration(duration) {
  const days = Number(duration);
  if (!Number.isFinite(days) || days <= 0 || days === 9999 || days >= 2147483647) {
    return 2147483647;
  }
  return Math.floor(Date.now() / 1000) + (days * 86400);
}

function playerLabel(announce) {
  const mention = parseDiscordMention(announce.discord);
  return mention ? `${mention} (**${announce.name || 'Jogador'}**)` : `**${announce.name || 'Jogador'}**`;
}

async function sendPublic(client, payload) {
  const channelId = store.load().commands?.banLogChannelId;
  if (!channelId) return false;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;
  await channel.send(payload).catch(() => {});
  return true;
}

function warnResultMessage(announce) {
  if (announce.type === 'warn') {
    if (announce.maxed) return `${announce.name} já está na 3ª advertência (3/3).`;
    return `${announce.name} recebeu a ${warnLabel(announce.level)} (${announce.level}/3).`;
  }
  if (announce.none) return `${announce.name} não tinha advertência.`;
  if (announce.level === 0) return `${announce.name} ficou sem advertências.`;
  return `${announce.name} voltou para a ${warnLabel(announce.level)} (${announce.level}/3).`;
}

async function publishModeration(client, action, result, staff, fields = {}) {
  const isWarnAction = action.id === 'advertencia_player' || action.id === 'remove_advertencia';
  let announce = isWarnAction ? buildWarnAnnounce(action, fields, result) : extractAnnounce(result);

  if (!announce && action.id === 'unban_player') {
    announce = {
      type: 'unban',
      name: fields.identifier || 'Jogador',
      reason: fields.reason || '',
      citizenid: '',
      license: '',
      license2: '',
      discord: '',
    };
  }
  if (!announce && action.id === 'ban_player') {
    announce = {
      type: 'ban',
      name: fields.playerId || 'Jogador',
      reason: fields.reason || '',
      playerId: fields.playerId || '',
      expire: banExpireFromDuration(fields.duration),
      discord: '',
    };
  }
  if (!announce) return null;
  attachProofs(announce, fields);

  const data = store.load().commands || {};
  const staffTag = `<@${staff.id}>`;

  if (announce.type === 'ban') {
    await applyBanRole(announce).catch((err) => console.error('[ban-role]', err.message));
    return announce;
  }

  if (announce.type === 'warn') {
    await applyWarnRole(announce).catch((err) => console.error('[warn-role]', err.message));
    const embed = fromTemplate(data.warnLogEmbed, {
      staff: staffTag,
      jogador: playerLabel(announce),
      motivo: announce.reason || '—',
      nivel: String(announce.level || 1),
      nivelTexto: warnLabel(announce.level || 1),
    }, { timestamp: true });
    await sendPublic(client, announcePayload(embed, announce));
    return announce;
  }

  if (announce.type === 'unwarn') {
    await removeWarnRole(announce).catch((err) => console.error('[unwarn-role]', err.message));
    const embed = fromTemplate(data.unwarnLogEmbed, {
      staff: staffTag,
      jogador: playerLabel(announce),
      motivo: announce.reason || '—',
      nivel: String(announce.level || 0),
      nivelTexto: warnLabel(announce.level || 0),
    }, { timestamp: true });
    await sendPublic(client, announcePayload(embed, announce));
    return announce;
  }

  if (announce.type === 'unban') {
    announce.reason = fields.reason || announce.reason || 'Desbanido pela staff';
    await removeBanRole(announce).catch((err) => console.error('[unban-role]', err.message));
    const embed = fromTemplate(data.unbanLogEmbed, {
      staff: staffTag,
      jogador: playerLabel(announce),
      motivo: announce.reason || '—',
    }, { timestamp: true });
    await sendPublic(client, announcePayload(embed, announce));
    return announce;
  }

  return announce;
}

async function sendProofFollowUp(client, announce) {
  const hasProof = (announce.proofLinks || []).length || (announce.proofFiles || []).length;
  if (!hasProof) return;
  const embed = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle('Provas')
    .setDescription(announce.name || 'Jogador');
  await sendPublic(client, announcePayload(embed, announce));
}

function chunkLines(lines, maxLength = 1024) {
  const chunks = [];
  let current = '';
  for (const raw of lines) {
    const line = String(raw || '').slice(0, maxLength);
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildActionResultEmbeds(action, result) {
  const payload = result?.result || result || {};
  const description = String(payload.message || result.message || `Comando \`${action.label}\` executado.`).slice(0, 4096);
  const fields = (payload.fields || [])
    .filter((field) => field && field.name && field.value)
    .slice(0, 25)
    .map((field) => ({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024),
      inline: Boolean(field.inline),
    }));
  const embed = successEmbed(action.label, description);
  if (fields.length) embed.addFields(fields);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (lines.length) {
    chunkLines(lines).slice(0, Math.max(0, 25 - fields.length)).forEach((chunk, index) => {
      embed.addFields({ name: index === 0 ? 'Itens' : `Itens (${index + 1})`, value: chunk });
    });
  }
  return [embed];
}

module.exports = {
  extractLinks,
  waitForProofs,
  handleProofSkip,
  handleProofConfirm,
  handleProofMore,
  publishModeration,
  sendProofFollowUp,
  warnResultMessage,
  buildActionResultEmbeds,
  extractAnnounce,
};
