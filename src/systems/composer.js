const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const store = require('../store');
const { fromVisual, success, error } = require('../utils/embeds');
const { denyIfNotAdmin } = require('../utils/permissions');
const { colors } = require('../config');

const selected = new Map();

function list() {
  const items = store.load().messages?.items;
  return Array.isArray(items) ? items : [];
}

function getItem(id) {
  return list().find((item) => item.id === id) || null;
}

function currentId(userId) {
  return selected.get(userId) || null;
}

function blankItem(name) {
  return {
    id: `msg-${Date.now().toString(36)}`,
    name: name.slice(0, 80),
    embed: {
      title: name.slice(0, 256),
      description: 'Edite este texto pelo criador de embed.',
      color: colors.gold,
      image: '',
      thumbnail: '',
      footer: '',
      author: '',
      authorIcon: '',
    },
    fields: [],
    buttonLabel: '',
    buttonUrl: '',
    channelId: null,
    messageId: null,
  };
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || '').trim());
}

function buildEmbed(item) {
  const visual = { ...(item.embed || {}) };
  const embed = fromVisual({
    ...visual,
    image: isHttpUrl(visual.image) ? visual.image : '',
    thumbnail: isHttpUrl(visual.thumbnail) ? visual.thumbnail : '',
  }, { timestamp: true });
  if (visual.author) {
    embed.setAuthor({
      name: String(visual.author).slice(0, 256),
      iconURL: isHttpUrl(visual.authorIcon) ? visual.authorIcon : undefined,
    });
  }
  const fields = (item.fields || []).slice(0, 25).filter((field) => field.name && field.value);
  if (fields.length) {
    embed.addFields(fields.map((field) => ({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024),
      inline: Boolean(field.inline),
    })));
  }
  if (!embed.data.title && !embed.data.description && !fields.length) {
    embed.setDescription('\u200b');
  }
  return embed;
}

function buildPayload(item) {
  const components = [];
  if (item.buttonLabel && /^https?:\/\//i.test(item.buttonUrl || '')) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(String(item.buttonLabel).slice(0, 80))
        .setURL(item.buttonUrl),
    ));
  }
  return { embeds: [buildEmbed(item)], components };
}

function navRow() {
  return require('./config').navSelect('composer');
}

function listView(userId) {
  const items = list();
  const id = currentId(userId);
  const current = id ? getItem(id) : null;
  const options = items.slice(0, 25).map((item) => ({
    label: item.name.slice(0, 100),
    description: (item.embed?.title || 'Sem título').slice(0, 100),
    value: item.id,
    default: item.id === id,
  }));
  const rows = [navRow()];
  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cfg:msg:pick')
      .setPlaceholder(items.length ? 'Escolher uma mensagem salva' : 'Nenhuma mensagem ainda')
      .setDisabled(!items.length)
      .addOptions(options.length ? options : [{ label: 'Nenhuma', value: 'none' }]),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg:msg:new').setLabel('Nova mensagem').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cfg:msg:edit').setLabel('Editar').setStyle(ButtonStyle.Primary).setDisabled(!current),
    new ButtonBuilder().setCustomId('cfg:msg:rename').setLabel('Renomear').setStyle(ButtonStyle.Secondary).setDisabled(!current),
    new ButtonBuilder().setCustomId('cfg:msg:delete').setLabel('Apagar').setStyle(ButtonStyle.Danger).setDisabled(!current),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg:msg:preview').setLabel('Pré-visualizar').setStyle(ButtonStyle.Secondary).setDisabled(!current),
    new ButtonBuilder().setCustomId('cfg:msg:send').setLabel('Enviar').setStyle(ButtonStyle.Success).setDisabled(!current),
    new ButtonBuilder().setCustomId('cfg:msg:update').setLabel('Atualizar enviada').setStyle(ButtonStyle.Primary).setDisabled(!current || !current.messageId),
  ));
  return {
    embeds: [fromVisual({
      title: '📝 Criador de embed',
      description:
        'Crie mensagens em embed, edite tudo e envie em qualquer canal.\n\n' +
        `Salvas: **${items.length}/25**\n` +
        (current
          ? `Selecionada: **${current.name}**\nÚltimo envio: ${current.channelId ? `<#${current.channelId}>` : '`ainda não enviada`'}`
          : 'Selecione uma mensagem ou crie uma nova.'),
      color: colors.gold,
      footer: 'Somente o cargo de configuração',
    })],
    components: rows,
  };
}

function editView(item) {
  const fields = (item.fields || []).map((field, i) => `**${i + 1}.** ${field.name}`).join('\n') || '`nenhum`';
  const button = item.buttonLabel && item.buttonUrl
    ? `[${item.buttonLabel}](${item.buttonUrl})`
    : '`nenhum`';
  return {
    embeds: [
      fromVisual({
        title: `📝 Editar • ${item.name}`,
        description:
          'Altere o visual abaixo. A prévia é o próprio embed desta mensagem + o resultado final.\n\n' +
          `Campos: ${fields}\nBotão: ${button}`,
        color: colors.gold,
      }),
      buildEmbed(item),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:msg:f:title').setLabel('Título').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:msg:f:description').setLabel('Descrição').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cfg:msg:f:color').setLabel('Cor').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:msg:f:footer').setLabel('Rodapé').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:msg:f:image').setLabel('Imagem').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:msg:f:thumbnail').setLabel('Thumbnail').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:msg:f:author').setLabel('Autor').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('cfg:msg:f:button').setLabel('Botão link').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:msg:field-add').setLabel('Novo campo').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg:msg:field-edit').setLabel('Editar campo').setStyle(ButtonStyle.Secondary).setDisabled(!(item.fields || []).length),
        new ButtonBuilder().setCustomId('cfg:msg:field-del').setLabel('Apagar campo').setStyle(ButtonStyle.Danger).setDisabled(!(item.fields || []).length),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:msg:send').setLabel('Enviar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cfg:msg:update').setLabel('Atualizar enviada').setStyle(ButtonStyle.Primary).setDisabled(!item.messageId),
        new ButtonBuilder().setCustomId('cfg:mod:composer').setLabel('Voltar').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function sendView() {
  return {
    embeds: [fromVisual({
      title: '📝 Enviar embed',
      description: 'Escolha o canal. A mensagem salva é enviada lá e fica ligada para você atualizar depois.',
      color: colors.gold,
    })],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('cfg:msg:ch-send')
          .setPlaceholder('Canal de destino')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:msg:edit').setLabel('Voltar').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
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
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  await interaction.update(payload);
}

function requireItem(interaction) {
  const item = getItem(currentId(interaction.user.id));
  if (!item) return null;
  return item;
}

function fieldModal(customId, title, inputs) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  for (const spec of inputs) {
    const input = new TextInputBuilder()
      .setCustomId(spec.id)
      .setLabel(spec.label.slice(0, 45))
      .setStyle(spec.style)
      .setRequired(Boolean(spec.required))
      .setMaxLength(spec.max);
    if (spec.placeholder) input.setPlaceholder(spec.placeholder);
    if (spec.value) input.setValue(String(spec.value).slice(0, spec.max));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

async function open(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  await show(interaction, listView(interaction.user.id));
}

function isComposerId(customId) {
  return Boolean(customId && (customId.startsWith('cfg:msg:') || customId === 'cfg:mod:composer'));
}

async function handleButton(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const id = interaction.customId;

  if (id === 'cfg:mod:composer') return show(interaction, listView(interaction.user.id));

  if (id === 'cfg:msg:new') {
    await interaction.showModal(fieldModal('cfg:msg:modal-new', 'Nova mensagem', [{
      id: 'name',
      label: 'Nome interno (só no painel)',
      style: TextInputStyle.Short,
      required: true,
      max: 80,
      placeholder: 'Ex: Regras da cidade',
    }]));
    return;
  }

  const item = requireItem(interaction);
  if (!item && id !== 'cfg:msg:new') {
    await interaction.reply({ embeds: [error('Selecione ou crie uma mensagem primeiro.')], ephemeral: true });
    return;
  }

  if (id === 'cfg:msg:edit') return show(interaction, editView(item));
  if (id === 'cfg:msg:send') return show(interaction, sendView());
  if (id === 'cfg:msg:preview') {
    await interaction.reply({ ...buildPayload(item), ephemeral: true });
    return;
  }
  if (id === 'cfg:msg:update') {
    if (!item.channelId || !item.messageId) {
      await interaction.reply({ embeds: [error('Essa mensagem ainda não foi enviada.')], ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(item.channelId).catch(() => null);
    const message = channel ? await channel.messages.fetch(item.messageId).catch(() => null) : null;
    if (!message) {
      await interaction.reply({ embeds: [error('Não achei a mensagem enviada. Envie de novo.')], ephemeral: true });
      return;
    }
    await message.edit(buildPayload(item));
    await interaction.reply({ embeds: [success(`Mensagem atualizada em ${channel}.`)], ephemeral: true });
    return;
  }
  if (id === 'cfg:msg:delete') {
    store.update((s) => {
      s.messages.items = (s.messages.items || []).filter((entry) => entry.id !== item.id);
    });
    selected.delete(interaction.user.id);
    return show(interaction, listView(interaction.user.id));
  }
  if (id === 'cfg:msg:rename') {
    await interaction.showModal(fieldModal('cfg:msg:modal-rename', 'Renomear mensagem', [{
      id: 'name',
      label: 'Novo nome interno',
      style: TextInputStyle.Short,
      required: true,
      max: 80,
      value: item.name,
    }]));
    return;
  }

  if (id === 'cfg:msg:f:title') {
    await interaction.showModal(fieldModal('cfg:msg:modal-title', 'Título', [{
      id: 'value', label: 'Título do embed', style: TextInputStyle.Short, required: false, max: 256, value: item.embed.title,
    }]));
    return;
  }
  if (id === 'cfg:msg:f:description') {
    await interaction.showModal(fieldModal('cfg:msg:modal-description', 'Descrição', [{
      id: 'value', label: 'Descrição (use \\n para quebrar linha)', style: TextInputStyle.Paragraph, required: false, max: 4000, value: item.embed.description,
    }]));
    return;
  }
  if (id === 'cfg:msg:f:color') {
    const hex = typeof item.embed.color === 'number'
      ? item.embed.color.toString(16).padStart(6, '0').toUpperCase()
      : '';
    await interaction.showModal(fieldModal('cfg:msg:modal-color', 'Cor', [{
      id: 'value', label: 'Hex, ex: C9A227', style: TextInputStyle.Short, required: false, max: 8, value: hex,
    }]));
    return;
  }
  if (id === 'cfg:msg:f:footer') {
    await interaction.showModal(fieldModal('cfg:msg:modal-footer', 'Rodapé', [{
      id: 'value', label: 'Texto do rodapé', style: TextInputStyle.Short, required: false, max: 2048, value: item.embed.footer,
    }]));
    return;
  }
  if (id === 'cfg:msg:f:image') {
    await interaction.showModal(fieldModal('cfg:msg:modal-image', 'Imagem', [{
      id: 'value', label: 'URL da imagem (vazio para remover)', style: TextInputStyle.Short, required: false, max: 500, value: item.embed.image,
    }]));
    return;
  }
  if (id === 'cfg:msg:f:thumbnail') {
    await interaction.showModal(fieldModal('cfg:msg:modal-thumbnail', 'Thumbnail', [{
      id: 'value', label: 'URL da thumbnail', style: TextInputStyle.Short, required: false, max: 500, value: item.embed.thumbnail,
    }]));
    return;
  }
  if (id === 'cfg:msg:f:author') {
    await interaction.showModal(fieldModal('cfg:msg:modal-author', 'Autor', [
      { id: 'name', label: 'Nome do autor', style: TextInputStyle.Short, required: false, max: 256, value: item.embed.author },
      { id: 'icon', label: 'URL do ícone (opcional)', style: TextInputStyle.Short, required: false, max: 500, value: item.embed.authorIcon },
    ]));
    return;
  }
  if (id === 'cfg:msg:f:button') {
    await interaction.showModal(fieldModal('cfg:msg:modal-button', 'Botão de link', [
      { id: 'label', label: 'Texto do botão', style: TextInputStyle.Short, required: false, max: 80, value: item.buttonLabel },
      { id: 'url', label: 'URL http(s)', style: TextInputStyle.Short, required: false, max: 500, value: item.buttonUrl },
    ]));
    return;
  }
  if (id === 'cfg:msg:field-add') {
    if ((item.fields || []).length >= 25) {
      await interaction.reply({ embeds: [error('O Discord aceita no máximo 25 campos.')], ephemeral: true });
      return;
    }
    await interaction.showModal(fieldModal('cfg:msg:modal-field-add', 'Novo campo', [
      { id: 'name', label: 'Nome do campo', style: TextInputStyle.Short, required: true, max: 256 },
      { id: 'value', label: 'Valor', style: TextInputStyle.Paragraph, required: true, max: 1024 },
      { id: 'inline', label: 'Na mesma linha? sim ou nao', style: TextInputStyle.Short, required: false, max: 3, value: 'nao' },
    ]));
    return;
  }
  if (id === 'cfg:msg:field-edit' || id === 'cfg:msg:field-del') {
    const fields = item.fields || [];
    if (!fields.length) {
      await interaction.reply({ embeds: [error('Não há campos para alterar.')], ephemeral: true });
      return;
    }
    await show(interaction, {
      embeds: [fromVisual({
        title: id === 'cfg:msg:field-del' ? 'Apagar campo' : 'Editar campo',
        description: 'Escolha o campo.',
        color: colors.gold,
      })],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(id === 'cfg:msg:field-del' ? 'cfg:msg:field-del-pick' : 'cfg:msg:field-edit-pick')
            .setPlaceholder('Campo')
            .addOptions(fields.slice(0, 25).map((field, index) => ({
              label: `${index + 1}. ${field.name}`.slice(0, 100),
              value: String(index),
            }))),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cfg:msg:edit').setLabel('Voltar').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  }
}

async function handleStringSelect(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const id = interaction.customId;

  if (id === 'cfg:msg:pick') {
    const value = interaction.values[0];
    if (value && value !== 'none') selected.set(interaction.user.id, value);
    return show(interaction, listView(interaction.user.id));
  }

  const item = requireItem(interaction);
  if (!item) {
    await interaction.reply({ embeds: [error('Selecione uma mensagem primeiro.')], ephemeral: true });
    return;
  }

  const index = Number(interaction.values[0]);
  if (id === 'cfg:msg:field-del-pick') {
    store.update((s) => {
      const found = (s.messages.items || []).find((entry) => entry.id === item.id);
      if (found) found.fields.splice(index, 1);
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:field-edit-pick') {
    const field = (item.fields || [])[index];
    if (!field) {
      await interaction.reply({ embeds: [error('Campo inválido.')], ephemeral: true });
      return;
    }
    await interaction.showModal(fieldModal(`cfg:msg:modal-field-edit:${index}`, `Editar campo ${index + 1}`, [
      { id: 'name', label: 'Nome do campo', style: TextInputStyle.Short, required: true, max: 256, value: field.name },
      { id: 'value', label: 'Valor', style: TextInputStyle.Paragraph, required: true, max: 1024, value: field.value },
      { id: 'inline', label: 'Na mesma linha? sim ou nao', style: TextInputStyle.Short, required: false, max: 3, value: field.inline ? 'sim' : 'nao' },
    ]));
  }
}

async function handleChannelSelect(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  if (interaction.customId !== 'cfg:msg:ch-send') return;
  const item = requireItem(interaction);
  if (!item) {
    await interaction.reply({ embeds: [error('Selecione uma mensagem primeiro.')], ephemeral: true });
    return;
  }
  const channel = interaction.channels.first();
  if (!channel) return;
  const message = await channel.send(buildPayload(item));
  store.update((s) => {
    const found = (s.messages.items || []).find((entry) => entry.id === item.id);
    if (!found) return;
    found.channelId = channel.id;
    found.messageId = message.id;
  });
  await show(interaction, listView(interaction.user.id));
  await interaction.followUp({
    embeds: [success(`Embed **${item.name}** enviado em ${channel}. [Abrir](${message.url})`)],
    ephemeral: true,
  });
}

function patchItem(itemId, mutator) {
  store.update((s) => {
    const found = (s.messages.items || []).find((entry) => entry.id === itemId);
    if (!found) return;
    mutator(found);
  });
}

async function handleModal(interaction) {
  if (await denyIfNotAdmin(interaction)) return;
  const id = interaction.customId;

  if (id === 'cfg:msg:modal-new') {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (list().length >= 25) {
      await interaction.reply({ embeds: [error('O Discord só lista 25 mensagens. Apague uma antes.')], ephemeral: true });
      return;
    }
    const item = blankItem(name);
    store.update((s) => {
      if (!s.messages) s.messages = { items: [] };
      if (!Array.isArray(s.messages.items)) s.messages.items = [];
      s.messages.items.push(item);
    });
    selected.set(interaction.user.id, item.id);
    return show(interaction, editView(item));
  }

  const item = requireItem(interaction);
  if (!item) {
    await interaction.reply({ embeds: [error('Selecione uma mensagem primeiro.')], ephemeral: true });
    return;
  }

  if (id === 'cfg:msg:modal-rename') {
    const name = interaction.fields.getTextInputValue('name').trim();
    patchItem(item.id, (found) => {
      found.name = name;
    });
    return show(interaction, listView(interaction.user.id));
  }

  if (id === 'cfg:msg:modal-title') {
    patchItem(item.id, (found) => {
      found.embed.title = interaction.fields.getTextInputValue('value').trim();
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:modal-description') {
    patchItem(item.id, (found) => {
      found.embed.description = interaction.fields.getTextInputValue('value').replace(/\\n/g, '\n');
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:modal-color') {
    const raw = interaction.fields.getTextInputValue('value').trim().replace('#', '');
    const n = Number.parseInt(raw, 16);
    if (raw && Number.isNaN(n)) {
      await interaction.reply({ embeds: [error('Cor inválida. Use hex, exemplo: C9A227')], ephemeral: true });
      return;
    }
    patchItem(item.id, (found) => {
      found.embed.color = raw ? n : colors.gold;
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:modal-footer') {
    patchItem(item.id, (found) => {
      found.embed.footer = interaction.fields.getTextInputValue('value').trim();
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:modal-image') {
    patchItem(item.id, (found) => {
      found.embed.image = interaction.fields.getTextInputValue('value').trim();
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:modal-thumbnail') {
    patchItem(item.id, (found) => {
      found.embed.thumbnail = interaction.fields.getTextInputValue('value').trim();
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:modal-author') {
    patchItem(item.id, (found) => {
      found.embed.author = interaction.fields.getTextInputValue('name').trim();
      found.embed.authorIcon = interaction.fields.getTextInputValue('icon').trim();
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:modal-button') {
    const label = interaction.fields.getTextInputValue('label').trim();
    const url = interaction.fields.getTextInputValue('url').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      await interaction.reply({ embeds: [error('O botão só aceita link http/https.')], ephemeral: true });
      return;
    }
    patchItem(item.id, (found) => {
      found.buttonLabel = label;
      found.buttonUrl = url;
    });
    return show(interaction, editView(getItem(item.id)));
  }
  if (id === 'cfg:msg:modal-field-add' || id.startsWith('cfg:msg:modal-field-edit:')) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const value = interaction.fields.getTextInputValue('value').replace(/\\n/g, '\n').trim();
    const inline = ['sim', 's', 'yes', 'y', '1'].includes(interaction.fields.getTextInputValue('inline').trim().toLowerCase());
    if (id === 'cfg:msg:modal-field-add') {
      patchItem(item.id, (found) => {
        if (!Array.isArray(found.fields)) found.fields = [];
        found.fields.push({ name, value, inline });
      });
    } else {
      const index = Number(id.slice('cfg:msg:modal-field-edit:'.length));
      patchItem(item.id, (found) => {
        if (found.fields[index]) found.fields[index] = { name, value, inline };
      });
    }
    return show(interaction, editView(getItem(item.id)));
  }
}

module.exports = {
  open,
  listView,
  isComposerId,
  handleButton,
  handleStringSelect,
  handleChannelSelect,
  handleModal,
};
