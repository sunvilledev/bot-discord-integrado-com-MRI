Config = {}

Config.DiscordInvite = 'link discord'

-- Na primeira conexão a qbx_core cria a linha em `users` ao mesmo tempo; espera ela aparecer.
Config.WaitForUserMs = 8000

-- Se a verificação passar disso, recusa com KickError em vez de deixar a tela travada.
Config.ConnectTimeoutMs = 20000

Config.KickNoLicense =
    'Sunville RP\n\nNão foi possível ler sua license do FiveM.\nReinicie o FiveM e tente de novo.\n\nDiscord: %s'

Config.KickError =
    'Sunville RP\n\nNão foi possível verificar sua passlist agora.\nTente de novo em alguns segundos. Se continuar, avise a staff no Discord.\n\nDiscord: %s'

-- %s 1 = license2 do jogador, %s 2 = convite do Discord
Config.KickNotListed =
    'Sunville RP\n\nVocê precisa fazer a PASSLIST para entrar na cidade.\n\n'
    .. 'Sua license2 (copie e cole no Discord):\n>>  %s  <<\n\n'
    .. '1. Entre no Discord: %s\n'
    .. '2. Envie o formulário da passlist e espere a staff aprovar\n'
    .. '3. No canal "Liberar meu ID", clique no botão e cole a license2 acima\n'
    .. '4. Conecte de novo'
