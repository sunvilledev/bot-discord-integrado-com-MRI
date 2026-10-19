fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'sunville_bridge'
author 'Sunville'
description 'Ponte HTTP do bot Discord Sunville para spawn na MRI QBCore/Qbox'
version '1.1.0'

client_script 'client/main.lua'

server_scripts {
    'config.lua',
    'server/helpers.lua',
    'server/commands.lua',
    'server/main.lua',
}
