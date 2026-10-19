fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'sunville_passlist'
author 'Sunville'
description 'Bloqueia a entrada no FiveM se o jogador não estiver na passlist (MySQL)'
version '1.0.0'

dependency 'oxmysql'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'config.lua',
    'server.lua',
}
