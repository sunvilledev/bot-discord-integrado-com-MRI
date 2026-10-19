const { REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const { token, clientId, guildId } = require('./config');

const ticket = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Tickets da Sunville')
  .addSubcommand((s) => s
    .setName('painel')
    .setDescription('Enviar o painel de tickets')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal do painel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) => s.setName('editar').setDescription('Editar o embed do painel de tickets'))
  .addSubcommand((s) => s.setName('fechar').setDescription('Fechar o ticket deste canal'))
  .addSubcommand((s) => s.setName('assumir').setDescription('Assumir o ticket deste canal'))
  .addSubcommand((s) => s
    .setName('chamar')
    .setDescription('Marcar alguém no ticket e enviar a mensagem no privado')
    .addUserOption((o) => o.setName('usuario').setDescription('Quem será marcado e avisado').setRequired(true))
    .addStringOption((o) => o.setName('mensagem').setDescription('Texto que vai no ticket e no privado').setRequired(true).setMaxLength(1500)))
  .addSubcommand((s) => s
    .setName('add-categoria')
    .setDescription('Adicionar uma categoria na lista do painel')
    .addStringOption((o) => o.setName('nome').setDescription('Nome na lista').setRequired(true))
    .addStringOption((o) => o.setName('descricao').setDescription('Texto curto da opção').setRequired(true))
    .addStringOption((o) => o.setName('inicio').setDescription('Mensagem padrão ao abrir o ticket. Use {user} e {categoria}').setRequired(true))
    .addStringOption((o) => o.setName('emoji').setDescription('Emoji da opção').setRequired(false))
    .addChannelOption((o) => o.setName('categoria').setDescription('Categoria Discord onde o ticket nasce').addChannelTypes(ChannelType.GuildCategory).setRequired(false)))
  .addSubcommand((s) => s
    .setName('edit-categoria')
    .setDescription('Alterar mensagem inicial, pasta ou texto de uma categoria')
    .addStringOption((o) => o.setName('nome').setDescription('Nome atual da categoria').setRequired(true))
    .addStringOption((o) => o.setName('descricao').setDescription('Novo texto da opção').setRequired(false))
    .addStringOption((o) => o.setName('inicio').setDescription('Nova mensagem padrão do ticket').setRequired(false))
    .addStringOption((o) => o.setName('emoji').setDescription('Novo emoji').setRequired(false))
    .addChannelOption((o) => o.setName('categoria').setDescription('Pasta Discord dos tickets').addChannelTypes(ChannelType.GuildCategory).setRequired(false)))
  .addSubcommand((s) => s
    .setName('del-categoria')
    .setDescription('Remover uma categoria pelo nome')
    .addStringOption((o) => o.setName('nome').setDescription('Nome da categoria').setRequired(true)))
  .addSubcommand((s) => s.setName('listar').setDescription('Listar categorias de ticket'))
  .addSubcommand((s) => s
    .setName('add-staff')
    .setDescription('Liberar um cargo para ver os tickets')
    .addRoleOption((o) => o.setName('cargo').setDescription('Cargo da staff').setRequired(true)))
  .addSubcommand((s) => s
    .setName('del-staff')
    .setDescription('Remover um cargo dos tickets')
    .addRoleOption((o) => o.setName('cargo').setDescription('Cargo da staff').setRequired(true)));

const hierarquia = new SlashCommandBuilder()
  .setName('hierarquia')
  .setDescription('Embed da hierarquia staff')
  .addSubcommand((s) => s
    .setName('enviar')
    .setDescription('Publicar o embed da hierarquia')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal do embed').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) => s.setName('atualizar').setDescription('Atualizar a hierarquia agora'))
  .addSubcommand((s) => s.setName('editar').setDescription('Editar título, cor e visual do embed'))
  .addSubcommand((s) => s
    .setName('add-cargo')
    .setDescription('Adicionar cargo na hierarquia')
    .addRoleOption((o) => o.setName('cargo').setDescription('Cargo staff').setRequired(true)))
  .addSubcommand((s) => s
    .setName('del-cargo')
    .setDescription('Remover cargo da hierarquia')
    .addRoleOption((o) => o.setName('cargo').setDescription('Cargo staff').setRequired(true)))
  .addSubcommand((s) => s.setName('listar').setDescription('Ver a ordem dos cargos'));

const conexao = new SlashCommandBuilder()
  .setName('conexao')
  .setDescription('Embed de conexão do FiveM')
  .addSubcommand((s) => s
    .setName('enviar')
    .setDescription('Publicar o embed de conexão')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal do embed').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) => s.setName('editar').setDescription('Editar o embed de conexão'))
  .addSubcommand((s) => s.setName('testar').setDescription('Testar conexão com o FiveM e o MySQL da MRI'))
  .addSubcommand((s) => s
    .setName('link')
    .setDescription('Definir o botão Conectar')
    .addStringOption((o) => o.setName('url').setDescription('Link cfx.re ou connect').setRequired(true)));

const sugestao = new SlashCommandBuilder()
  .setName('sugestao')
  .setDescription('Painel e canal de sugestões')
  .addSubcommand((s) => s
    .setName('painel')
    .setDescription('Enviar o painel para o público')
    .addChannelOption((o) => o.setName('canal').setDescription('Onde o público clica').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption((o) => o.setName('destino').setDescription('Onde as sugestões aparecem para voto').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) => s.setName('editar').setDescription('Editar o embed do painel'))
  .addSubcommand((s) => s
    .setName('canal')
    .setDescription('Trocar o canal de destino')
    .addChannelOption((o) => o.setName('destino').setDescription('Canal das sugestões').addChannelTypes(ChannelType.GuildText).setRequired(true)));

const verificacao = new SlashCommandBuilder()
  .setName('verificacao')
  .setDescription('Painel de verificação por código')
  .addSubcommand((s) => s
    .setName('painel')
    .setDescription('Enviar o painel de verificação')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal do painel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption((o) => o.setName('cargo').setDescription('Cargo dado após acertar o código').setRequired(true)))
  .addSubcommand((s) => s.setName('editar').setDescription('Editar o embed da verificação'))
  .addSubcommand((s) => s
    .setName('cargo')
    .setDescription('Trocar o cargo da verificação')
    .addRoleOption((o) => o.setName('cargo').setDescription('Cargo liberado').setRequired(true)));

const passlist = new SlashCommandBuilder()
  .setName('passlist')
  .setDescription('Passlist da Sunville: formulário, staff e liberação na DB')
  .addSubcommand((s) => s.setName('setup').setDescription('Criar cargos, canais e publicar os painéis da passlist'))
  .addSubcommand((s) => s
    .setName('painel')
    .setDescription('Publicar o embed do formulário')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal público do formulário').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) => s
    .setName('liberar-painel')
    .setDescription('Publicar o embed de liberar ID')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal de quem já foi aprovado').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) => s
    .setName('canal-staff')
    .setDescription('Canal onde a staff aprova ou reprova')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal da staff').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand((s) => s
    .setName('cargos')
    .setDescription('Cargos de em análise e aprovado')
    .addRoleOption((o) => o.setName('em-analise').setDescription('Cargo dado ao enviar o formulário').setRequired(true))
    .addRoleOption((o) => o.setName('aprovado').setDescription('Cargo que libera o canal de ID').setRequired(true)))
  .addSubcommand((s) => s
    .setName('editar')
    .setDescription('Editar o embed do formulário ou do liberar ID')
    .addStringOption((o) => o
      .setName('alvo')
      .setDescription('Qual embed editar')
      .setRequired(true)
      .addChoices(
        { name: 'Formulário', value: 'passlist' },
        { name: 'Liberar ID', value: 'passlistRelease' },
      )))
  .addSubcommand((s) => s
    .setName('add')
    .setDescription('Liberar na passlist: marque a pessoa e/ou cole a license')
    .addUserOption((o) => o.setName('usuario').setDescription('Marque o Discord da pessoa').setRequired(false))
    .addStringOption((o) => o.setName('license').setDescription('License do FiveM (tela de kick)').setRequired(false)))
  .addSubcommand((s) => s
    .setName('del')
    .setDescription('Remover da passlist: marque a pessoa e/ou cole a license')
    .addUserOption((o) => o.setName('usuario').setDescription('Marque o Discord da pessoa').setRequired(false))
    .addStringOption((o) => o.setName('license').setDescription('License do FiveM').setRequired(false)));

const logs = new SlashCommandBuilder()
  .setName('logs')
  .setDescription('Canal de quem entra e sai do Discord (não mistura com tickets)')
  .addSubcommand((s) => s
    .setName('canal')
    .setDescription('Definir o canal de quem entra e sai')
    .addChannelOption((o) => o.setName('canal').setDescription('Canal dos logs').addChannelTypes(ChannelType.GuildText).setRequired(true)));

const chamar = new SlashCommandBuilder()
  .setName('chamar')
  .setDescription('Marcar alguém no ticket e enviar a mensagem no privado')
  .addUserOption((o) => o.setName('usuario').setDescription('Quem será marcado e avisado').setRequired(true))
  .addStringOption((o) => o.setName('mensagem').setDescription('Texto que vai no ticket e no privado').setRequired(true).setMaxLength(1500));

const fechar = new SlashCommandBuilder()
  .setName('fechar')
  .setDescription('Fechar o ticket deste canal');

const assumir = new SlashCommandBuilder()
  .setName('assumir')
  .setDescription('Assumir o ticket deste canal');

const conectar = new SlashCommandBuilder()
  .setName('conectar')
  .setDescription('Testar conexão com o servidor FiveM e o banco MySQL da MRI');

const configurar = new SlashCommandBuilder()
  .setName('configurar')
  .setDescription('Painel para editar todos os embeds e configurações do bot');

const mensagem = new SlashCommandBuilder()
  .setName('mensagem')
  .setDescription('Criar, editar e enviar embeds em qualquer canal');

const painel = new SlashCommandBuilder()
  .setName('painel')
  .setDescription('Mostra onde está o painel fixo de comandos in-game');

const fixarPainel = new SlashCommandBuilder()
  .setName('fixar-painel')
  .setDescription('Fixa o painel de comandos in-game neste canal');

const commands = [configurar, mensagem, conectar, painel, fixarPainel, ticket, hierarquia, conexao, sugestao, verificacao, passlist, logs, chamar, fechar, assumir].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

async function deploy() {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`Slash commands registrados no servidor ${guildId}.`);
}

if (require.main === module) {
  deploy().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { deploy, commands };
