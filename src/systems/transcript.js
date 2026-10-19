const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { colors } = require('../config');

async function fetchAllMessages(channel) {
  const collected = [];
  let lastId;
  while (collected.length < 2000) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options);
    if (!batch.size) break;
    collected.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function lineFor(message) {
  const time = new Date(message.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
  const author = `${message.author?.tag || 'Desconhecido'} (${message.author?.id || '?'})`;
  const attachments = [...(message.attachments?.values() || [])].map((a) => a.url).join(' ');
  const embeds = message.embeds?.length ? `[${message.embeds.length} embed(s)]` : '';
  const content = message.content || embeds || '(sem texto)';
  return `[${time}] ${author}: ${content}${attachments ? `\n  arquivos: ${attachments}` : ''}`;
}

function buildTranscriptText({ number, categoryLabel, openerTag, openerId, closerTag, messages }) {
  const header = [
    '========================================',
    `Sunville • Transcript do ticket #${String(number).padStart(3, '0')}`,
    `Categoria: ${categoryLabel || '—'}`,
    `Aberto por: ${openerTag || '—'} (${openerId || '—'})`,
    `Fechado por: ${closerTag || '—'}`,
    `Mensagens: ${messages.length}`,
    `Gerado em: ${new Date().toISOString()}`,
    'Guardado no banco por 30 dias.',
    '========================================',
    '',
  ];
  return `${header.join('\n')}${messages.map(lineFor).join('\n')}\n`;
}

function transcriptAttachment(text, number) {
  const name = `transcript-${String(number).padStart(3, '0')}.txt`;
  const buf = Buffer.from(text, 'utf8');
  const max = 7.5 * 1024 * 1024;
  const body = buf.length > max ? Buffer.from(`${text.slice(0, max - 80)}\n\n[transcript cortado por tamanho]`, 'utf8') : buf;
  return new AttachmentBuilder(body, { name });
}

function logEmbed({ number, categoryLabel, openerId, closerId, openedAt, messageCount }) {
  const opened = openedAt ? `<t:${Math.floor(openedAt / 1000)}:R>` : '—';
  return new EmbedBuilder()
    .setColor(colors.leave)
    .setTitle(`🔒 Ticket #${String(number).padStart(3, '0')} fechado`)
    .addFields(
      { name: 'Categoria', value: categoryLabel || '—', inline: true },
      { name: 'Aberto por', value: `<@${openerId}>`, inline: true },
      { name: 'Fechado por', value: `<@${closerId}>`, inline: true },
      { name: 'Aberto', value: opened, inline: true },
      { name: 'Mensagens', value: `${messageCount}`, inline: true },
    )
    .setFooter({ text: 'Log de tickets • transcript em anexo • 30 dias no banco' })
    .setTimestamp();
}

function openLogEmbed({ number, categoryLabel, openerId, channelId }) {
  return new EmbedBuilder()
    .setColor(colors.success)
    .setTitle(`🎫 Ticket #${String(number).padStart(3, '0')} aberto`)
    .addFields(
      { name: 'Categoria', value: categoryLabel || '—', inline: true },
      { name: 'Aberto por', value: `<@${openerId}>`, inline: true },
      { name: 'Canal', value: `<#${channelId}>`, inline: true },
    )
    .setFooter({ text: 'Log de tickets • separado da entrada/saída' })
    .setTimestamp();
}

function dmEmbed({ number, categoryLabel, closerId, staffId }) {
  const store = require('../store');
  const { fromTemplate } = require('../utils/embeds');
  return fromTemplate(store.load().tickets.closeDmEmbed, {
    ticket: String(number).padStart(3, '0'),
    categoria: categoryLabel || 'ticket',
    closer: `<@${closerId}>`,
    staff: staffId ? `<@${staffId}>` : 'a staff',
  }, { timestamp: true });
}

module.exports = {
  fetchAllMessages,
  buildTranscriptText,
  transcriptAttachment,
  logEmbed,
  openLogEmbed,
  dmEmbed,
};
