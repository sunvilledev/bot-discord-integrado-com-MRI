# Sunville Bot

**O Discord da sua cidade e o FiveM no mesmo bot.**

Bot de Discord tudo-em-um para cidades de roleplay FiveM (**QBCore / Qbox / MRI**). Tickets com transcript e avaliação, whitelist por entrevista, painel de comandos in-game, bate-ponto da staff, hierarquia, logs, anti-link, verificação, backup do banco e criador de embeds — tudo configurável pelo comando `/configurar`, sem abrir arquivo e sem programar.

![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![FiveM](https://img.shields.io/badge/FiveM-QBCore%20%7C%20Qbox%20%7C%20MRI-F40552)

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Requisitos](#requisitos)
- [Guia de instalação](#guia-de-instalação)
  - [1. Baixar o projeto](#1-baixar-o-projeto)
  - [2. Criar o bot no Discord](#2-criar-o-bot-no-discord)
  - [3. Configurar o `.env`](#3-configurar-o-env)
  - [4. Instalar e registrar os comandos](#4-instalar-e-registrar-os-comandos)
  - [5. Ligar o bot](#5-ligar-o-bot)
  - [6. Conectar ao FiveM (opcional)](#6-conectar-ao-fivem-opcional)
  - [7. Deixar rodando 24h](#7-deixar-rodando-24h)
- [Primeira configuração no Discord](#primeira-configuração-no-discord)
- [Comandos](#comandos)
- [Dados e backups](#dados-e-backups)
- [Problemas comuns](#problemas-comuns)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

---

## Funcionalidades

### Painel `/configurar`
O coração do bot. Quem tem o cargo de configuração (ou é Administrador) edita **tudo** pelo Discord: canais, cargos, categorias, textos, cores e imagens de cada embed. Os painéis já publicados se atualizam sozinhos quando algo muda.

### Tickets
- Painel público com menu de categorias (Suporte, Denúncia, Dúvidas, VIP… você escolhe)
- Cada categoria tem emoji, descrição, categoria do Discord, mensagem inicial e cargos de staff próprios
- Botões **Assumir**, **Chamar** (marca no ticket e manda no privado) e **Fechar**
- Transcript em `.txt` enviado no log e no privado de quem abriu
- Avaliação de **1 a 5 estrelas** do atendimento, enviada a um canal configurável
- **Rank semanal** de tickets assumidos, com reset no sábado 00:01

### Passlist / Whitelist
- Entrevista em **canal privado**, pergunta por pergunta, com o chat limpo a cada resposta
- Staff aprova ou reprova (com motivo); o jogador recebe o resultado no privado
- Anúncio público de aprovados e reprovados
- Botão **Liberar meu ID**: o jogador cola a `license` e a conta é liberada na tabela `users` (coluna `passlist`)
- Até 20 perguntas editáveis; `/passlist setup` cria cargos, canais e painéis automaticamente

### Painel de comandos in-game
A staff administra a cidade **pelo Discord**, sem abrir o jogo. Permissões por cargo, log interno de cada ação e anúncio público de ban.

| Categoria | Comandos |
|---|---|
| Jogador | Reviver, congelar, bêbado, remover estresse, menu de roupas, definir ped, kick, advertência, banir, mutar, algemar, puxar, teleportar, tocar som |
| Economia e grupos | Dar/remover dinheiro, dar item, item/dinheiro para todos, limpar inventário (online e offline), setar/demitir emprego e gangue |
| Veículos | Spawnar, consertar, abastecer, deletar próximo, maximizar mods, trocar placa |
| Servidor | Reviver todos, clima, horário, queda de energia, teleporte por coordenadas |

### Bate-ponto da staff
- Painel com **Iniciar**, **Finalizar** e **Tempo**
- Log de cada entrada e saída e rank semanal ao vivo
- Fuso, dia e hora do reset configuráveis (padrão: `America/Sao_Paulo`, sábado 00:01)

### E mais
- **Call automática**: a staff entra no lobby e o bot cria uma call de atendimento, que é apagada quando esvazia
- **Anti-link**: libera por cargo, canal ou domínio
- **Hierarquia da staff**: embed com a lista de cargos e membros, atualizado a cada 1 hora
- **Conexão FiveM**: painel com botão **Conectar** (`cfx.re` ou IP)
- **Sugestões** com votação
- **Verificação anti-bot** por código
- **Logs de entrada e saída** do servidor
- **Apelido automático** no formato `Nome | #citizenid`, puxado do banco da cidade
- **Backup automático do MySQL**, compactado e enviado a um canal do Discord
- **Criador de embed**: até 25 mensagens salvas, com edição da mensagem já enviada (`/mensagem`)

---

## Requisitos

| Item | Obrigatório? | Para quê |
|---|---|---|
| [Node.js 18+](https://nodejs.org/) | Sim | Rodar o bot |
| Aplicação no [Discord Developer Portal](https://discord.com/developers/applications) | Sim | Token do bot |
| MySQL / MariaDB da cidade | Para passlist, apelido e backup | Ler e escrever na tabela `users` |
| Servidor FiveM com o resource `sunville_bridge` | Para os comandos in-game | Executar as ações no jogo |
| `mysqldump` no PATH | Não | Deixa o backup mais rápido (sem ele, o bot gera o dump em Node) |

O bot funciona sem FiveM e sem MySQL: tickets, ponto, hierarquia, sugestões, verificação, logs, anti-link e embeds rodam só com o Discord.

---

## Guia de instalação

### 1. Baixar o projeto

```bash
git clone https://github.com/SEU-USUARIO/sunville-bot.git
cd sunville-bot
```

Ou clique em **Code → Download ZIP** e extraia a pasta.

### 2. Criar o bot no Discord

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications) e clique em **New Application**.
2. Em **General Information**, copie o **Application ID**: ele vai no `DISCORD_CLIENT_ID`.
3. Em **Bot**, clique em **Reset Token** e copie o token: ele vai no `DISCORD_TOKEN`. **Não mostre esse token para ninguém.**
4. Ainda em **Bot**, ative os intents:
   - **SERVER MEMBERS INTENT**
   - **MESSAGE CONTENT INTENT**
5. Em **OAuth2 → URL Generator**, marque os escopos `bot` e `applications.commands` e as permissões:
   - Gerenciar canais, Gerenciar cargos, Gerenciar apelidos, Gerenciar mensagens
   - Ver canais, Enviar mensagens, Inserir links, Anexar arquivos, Ler histórico
   - Conectar e Mover membros (call automática)

   Se preferir simplificar, marque **Administrator**.
6. Abra o link gerado e adicione o bot ao seu servidor.
7. Em **Configurações do servidor → Cargos**, arraste o cargo do bot **acima** dos cargos que ele vai entregar (verificação, whitelist, staff).

Para copiar IDs de servidor, cargos e canais, ative em **Configurações do Discord → Avançado → Modo desenvolvedor** e clique com o botão direito em cada item → **Copiar ID**.

### 3. Configurar o `.env`

Copie o arquivo de exemplo:

```bash
# Windows (PowerShell)
copy .env.example .env

# Linux / macOS
cp .env.example .env
```

Abra o `.env` e preencha:

```env
# Obrigatórios
DISCORD_TOKEN=token_do_bot
DISCORD_CLIENT_ID=id_da_aplicacao
DISCORD_GUILD_ID=id_do_seu_servidor
ADMIN_ROLE_ID=id_do_cargo_que_pode_usar_o_/configurar

# Conexão FiveM (status e botão Conectar) — use o IP:porta OU o código cfx.re
FIVEM_ENDPOINT=http://IP_DO_SERVIDOR:30120
FIVEM_CFX_CODE=

# MySQL / MariaDB da cidade (passlist, apelido automático e backup)
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=nome_do_banco

# Ponte de comandos in-game
FIVEM_URL=http://IP_DO_SERVIDOR:30120
FIVEM_RESOURCE=sunville_bridge
FIVEM_TOKEN=um_token_secreto_qualquer

# Opcionais (também podem ser definidos depois pelo /configurar)
STAFF_ROLE_ID=
LOG_CHANNEL_ID=
PANEL_CHANNEL_ID=
```

Só as quatro primeiras variáveis são obrigatórias; sem elas o bot não liga. O resto pode ficar vazio e ser ajustado depois pelo `/configurar`.

### 4. Instalar e registrar os comandos

```bash
npm install
npm run deploy
```

O `npm run deploy` registra os comandos de barra (`/configurar`, `/ticket`, etc.) no servidor do `DISCORD_GUILD_ID`. Rode de novo sempre que atualizar o bot.

### 5. Ligar o bot

```bash
npm start
```

Se tudo estiver certo, o bot aparece online no Discord. Use `/configurar` para começar.

### 6. Conectar ao FiveM (opcional)

O painel de comandos in-game conversa com o resource **`sunville_bridge`** por HTTP, usando a porta do jogo (normalmente `30120`).

1. Coloque a pasta `sunville_bridge` em `resources/` do seu servidor FiveM.
2. Configure no resource o **mesmo token** usado em `FIVEM_TOKEN` no `.env`.
3. No `server.cfg`, adicione:

   ```cfg
   ensure sunville_bridge
   ```

4. Reinicie o servidor e rode `/conectar` no Discord para testar FiveM e MySQL.

<details>
<summary><b>Quer escrever sua própria ponte?</b> Veja o que o bot espera.</summary>

O bot faz requisições para `FIVEM_URL/FIVEM_RESOURCE/<rota>` com o cabeçalho `Authorization: Bearer FIVEM_TOKEN` e corpo JSON:

| Método | Rota | Corpo | Uso |
|---|---|---|---|
| `GET` | `/status` | — | Status do servidor (alternativa ao `/dynamic.json`) |
| `GET` | `/players` | — | Lista de jogadores: `{ "players": [{ "id", "name" }] }` |
| `POST` | `/spawn` | `{ playerId, model, plate, warp }` | Spawnar veículo |
| `POST` | `/command` | `{ action, fields }` | Executar qualquer ação do painel |

Respostas com status diferente de 2xx devem trazer `{ "error": "mensagem" }`, que o bot mostra para a staff.

</details>

### 7. Deixar rodando 24h

Se o processo cair, tickets, ponto e whitelist param. Algumas opções:

**PM2 (VPS ou PC)**

```bash
npm install -g pm2
pm2 start src/index.js --name sunville-bot
pm2 save
pm2 startup
```

**Square Cloud**

O projeto já vem com o `squarecloud.config`. Compacte a pasta **sem** `node_modules`, envie no painel da Square Cloud e cadastre as variáveis do `.env` nas configurações da aplicação.

**Windows**

Use o [NSSM](https://nssm.cc/) para registrar `node src/index.js` como serviço.

---

## Primeira configuração no Discord

Tudo pelo `/configurar`, com o cargo definido em `ADMIN_ROLE_ID`:

1. **Passlist**: rode `/passlist setup` (ou publique os painéis manualmente) e edite as perguntas
2. **Tickets**: categorias, staff, canal do painel, log, avaliação e rank
3. **Hierarquia**: cargos na ordem e publicar
4. **Conexão FiveM**: texto e link `cfx.re`
5. **Sugestões** e **Verificação**: painel e canal de destino / cargo
6. **Entrada e saída**: canal de logs de membros
7. **Painel in-game**: ponte FiveM, permissões por cargo, publicar e log de ban
8. **Bate-ponto**: painel, rank e log
9. **Call automática**: lobby, categoria e cargo privilegiado
10. **Anti-link**: ligar e liberar cargos, canais e domínios
11. **Backup**: canal de destino e intervalo
12. **Criador de embed**: regras, anúncios, loja e o que mais quiser

Os textos aceitam variáveis conforme o módulo: `{user}`, `{username}`, `{staff}`, `{ticket}`, `{categoria}`, `{motivo}`, `{periodo}`, `{lista}`, `{jogador}`, `{duracaoTexto}`, entre outras.

---

## Comandos

| Comando | O que faz |
|---|---|
| `/configurar` | Painel geral de configuração |
| `/mensagem` | Abre o criador de embed |
| `/conectar` | Testa a conexão com FiveM e MySQL |
| `/painel` | Mostra onde está o painel in-game |
| `/fixar-painel` | Fixa o painel in-game no canal atual |
| `/ticket …` | Painel, categorias, staff, fechar, assumir, chamar |
| `/fechar` `/assumir` `/chamar` | Atalhos dentro do ticket |
| `/hierarquia …` | Publicar, atualizar, editar e cargos |
| `/conexao …` | Embed e link de conexão |
| `/sugestao …` | Painel e canal de destino |
| `/verificacao …` | Painel e cargo |
| `/passlist …` | Setup, painéis, cargos, adicionar e remover no banco |
| `/logs canal` | Canal de entrada e saída |

---

## Dados e backups

| Arquivo / pasta | Conteúdo |
|---|---|
| `data/guild.json` | Tudo que foi configurado pelo `/configurar` |
| `data/sunville.db` | Banco SQLite local: transcripts, ranks, avaliações e ponto |
| `data/backups/` | Backups `.sql.gz` do MySQL da cidade |

Os três já estão no `.gitignore`. Para migrar o bot de máquina, copie a pasta `data/` junto com o `.env`.

> **Segurança:** nunca publique o `.env`, o token do bot, a senha do MySQL ou os arquivos de `data/`. Se o token vazar, gere outro no Developer Portal imediatamente.

---

## Problemas comuns

**`Variável DISCORD_TOKEN não definida no .env`**
O `.env` não existe ou está em outra pasta. Ele precisa ficar na raiz do projeto, ao lado do `package.json`.

**Os comandos de barra não aparecem**
Rode `npm run deploy` e confira se o `DISCORD_GUILD_ID` é o ID do servidor certo. Às vezes é preciso reiniciar o Discord (Ctrl+R).

**`Missing Permissions` ao dar cargo ou criar canal**
O cargo do bot está abaixo do cargo que ele tenta entregar. Arraste-o para cima na lista de cargos.

**O bot não lê as respostas da whitelist**
O **MESSAGE CONTENT INTENT** está desligado no Developer Portal.

**`Não foi possível conectar no FiveM`**
Use a porta **do jogo** (em geral `30120`), não a do txAdmin nem a do MySQL. Confira também se o firewall libera essa porta.

**`O resource sunville_bridge no FiveM está desatualizado`**
Copie a pasta do resource de novo e rode `ensure sunville_bridge` (ou reinicie o servidor).

**Passlist não libera o ID**
Confira os dados do MySQL no `.env` e se a tabela `users` tem a coluna `passlist`. O `/conectar` mostra se o banco está acessível.

---

## Contribuindo

Contribuições são bem-vindas:

1. Faça um fork do repositório
2. Crie uma branch: `git checkout -b minha-melhoria`
3. Faça commit das alterações: `git commit -m "Adiciona minha melhoria"`
4. Envie: `git push origin minha-melhoria`
5. Abra um Pull Request

Encontrou um bug ou tem uma ideia? Abra uma [issue](../../issues).

---

## Licença

Distribuído sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

**Sunville Bot** — Discord e FiveM no mesmo lugar.
