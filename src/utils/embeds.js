const { EmbedBuilder } = require('discord.js');
const { colors } = require('../config');

function applyVisual(embed, visual = {}) {
  embed.setTitle(visual.title || null);
  embed.setDescription(visual.description || null);
  embed.setColor(parseColor(visual.color) ?? colors.gold);
  if (visual.image) embed.setImage(visual.image);
  if (visual.thumbnail) embed.setThumbnail(visual.thumbnail);
  if (visual.footer) embed.setFooter({ text: visual.footer });
  return embed;
}

function parseColor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  const hex = String(value).replace('#', '').trim();
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? null : n;
}

function fillVars(text, vars = {}) {
  let out = text == null ? '' : String(text);
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value == null ? '' : String(value));
  }
  return out;
}

function fromVisual(visual, extras = {}) {
  const embed = new EmbedBuilder();
  applyVisual(embed, visual);
  if (extras.timestamp) embed.setTimestamp(extras.timestamp === true ? undefined : extras.timestamp);
  if (extras.author) embed.setAuthor(extras.author);
  return embed;
}

function fromTemplate(visual = {}, vars = {}, extras = {}) {
  const description = visual.description && !String(visual.description).includes('{lista}') && vars.lista
    ? `${visual.description}\n\n{lista}`
    : visual.description;
  return fromVisual({
    ...visual,
    title: fillVars(visual.title, vars) || null,
    description: fillVars(description, vars) || null,
    footer: fillVars(visual.footer, vars) || visual.footer || null,
  }, extras);
}

function success(text) {
  return new EmbedBuilder().setColor(colors.success).setDescription(text);
}

function error(text) {
  return new EmbedBuilder().setColor(colors.error).setDescription(text);
}

function info(text) {
  return new EmbedBuilder().setColor(colors.info).setDescription(text);
}

module.exports = { applyVisual, parseColor, fromVisual, fromTemplate, fillVars, success, error, info };
