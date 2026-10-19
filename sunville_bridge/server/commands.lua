local CommandHandlers = {}

local function needPlayer(fields)
    local id, err = BridgeRequireOnline(fields.playerId)
    if not id then
        return nil, err
    end
    return id
end

CommandHandlers.revive_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    BridgeRevive(id)
    return { message = ('Jogador %s revivido.'):format(id) }
end

CommandHandlers.revive_all = function()
    for _, id in ipairs(GetPlayers()) do
        BridgeRevive(tonumber(id))
    end
    return { message = 'Todos os jogadores foram revividos.' }
end

CommandHandlers.freeze_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local ped = GetPlayerPed(id)
    local frozen = false
    pcall(function()
        frozen = Entity(ped).state.sunvilleFrozen
        Entity(ped).state:set('sunvilleFrozen', not frozen, true)
    end)
    FreezeEntityPosition(ped, not frozen)
    return { message = not frozen and ('Jogador %s congelado.'):format(id) or ('Jogador %s descongelado.'):format(id) }
end

CommandHandlers.drunk_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    TriggerClientEvent('mri_Qadmin:client:InitiateDrunkEffect', id)
    return { message = ('Efeito de bebida aplicado em %s.'):format(id) }
end

CommandHandlers.remove_stress = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local player = BridgeGetPlayer(id)
    if player then
        player.Functions.SetMetaData('stress', 0)
    end
    TriggerClientEvent('mri_Qadmin:client:removeStress', id)
    return { message = ('Estresse removido de %s.'):format(id) }
end

CommandHandlers.clothing_menu = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    TriggerClientEvent('qb-clothing:client:openMenu', id)
    return { message = ('Menu de roupas aberto para %s.'):format(id) }
end

CommandHandlers.set_ped = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local model = tostring(fields.ped or ''):gsub('%s+', '')
    if model == '' or not model:match('^[%w_]+$') then
        return nil, 'Informe um modelo de ped válido.'
    end
    TriggerClientEvent('mri_Qadmin:client:setPed', id, model)
    return { message = ('Ped %s aplicado em %s.'):format(model, id) }
end

CommandHandlers.kick_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    DropPlayer(id, fields.reason ~= '' and fields.reason or 'Você foi expulso pela staff.')
    return { message = ('Jogador %s expulso.'):format(id) }
end

CommandHandlers.warn_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    BridgeNotify(id, ('Aviso da staff: %s'):format(fields.reason or ''), 'error')
    return { message = ('Aviso enviado para %s.'):format(id) }
end

local function banSecondsFromDays(days)
    days = tonumber(days)
    if not days or days <= 0 or days == 9999 then
        return 2147483647
    end
    return math.floor(days * 86400)
end

local function durationLabel(seconds)
    seconds = tonumber(seconds) or 2147483647
    if seconds >= 2147483647 then
        return 'Permanente'
    end
    if seconds >= 86400 then
        local days = math.floor(seconds / 86400)
        return days == 1 and '1 dia' or (days .. ' dias')
    end
    if seconds >= 3600 then
        local hours = math.floor(seconds / 3600)
        return hours == 1 and '1 hora' or (hours .. ' horas')
    end
    local minutes = math.max(1, math.floor(seconds / 60))
    return minutes == 1 and '1 minuto' or (minutes .. ' minutos')
end

local function collectBanIdentifiers(playerId)
    local found = { license = '', license2 = '', discord = '', ip = '' }
    for i = 0, GetNumPlayerIdentifiers(playerId) - 1 do
        local identifier = GetPlayerIdentifier(playerId, i) or ''
        if identifier:sub(1, 9) == 'license2:' then
            found.license2 = identifier
        elseif identifier:sub(1, 8) == 'license:' then
            found.license = identifier
        elseif identifier:sub(1, 8) == 'discord:' then
            found.discord = identifier
        elseif identifier:sub(1, 3) == 'ip:' then
            found.ip = identifier
        end
    end
    return found
end

local mysqlSingle, mysqlExecute, ensureBanIdTable

local function trimQuery(value)
    local text = tostring(value or ''):gsub('^%s+', ''):gsub('%s+$', '')
    local mention = text:match('^<@!?(%d+)>$')
    return mention or text
end

local function isDiscordId(value)
    local id = tostring(value or ''):gsub('^discord:', '')
    return id:match('^%d%d%d%d%d%d%d%d%d%d%d%d%d%d%d+$') ~= nil
end

local function normalizeDiscord(value)
    local id = tostring(value or ''):gsub('^discord:', ''):gsub('^%s+', ''):gsub('%s+$', '')
    if not isDiscordId(id) then
        return ''
    end
    return 'discord:' .. id
end

local function nameFromCharinfo(charinfo, fallback)
    if type(charinfo) == 'string' and charinfo ~= '' then
        local ok, decoded = pcall(json.decode, charinfo)
        if ok then
            charinfo = decoded
        end
    end
    if type(charinfo) == 'table' then
        local fullName = ((charinfo.firstname or '') .. ' ' .. (charinfo.lastname or '')):gsub('^%s+', ''):gsub('%s+$', '')
        if fullName ~= '' then
            return fullName
        end
    end
    return fallback
end

local function identityFromOnline(id)
    id = tonumber(id)
    if not id or not GetPlayerName(id) then
        return nil
    end
    local identifiers = collectBanIdentifiers(id)
    local player = BridgeGetPlayer(id)
    local citizenid = player and player.PlayerData and player.PlayerData.citizenid or ''
    local name = GetPlayerName(id)
    if player and player.PlayerData then
        name = nameFromCharinfo(player.PlayerData.charinfo, name)
    end
    return {
        playerId = id,
        name = name or tostring(id),
        citizenid = citizenid,
        license = identifiers.license or '',
        license2 = identifiers.license2 or '',
        discord = identifiers.discord or '',
    }
end

local function findOnlineByCitizenId(citizenid)
    if not citizenid or citizenid == '' then
        return nil
    end
    if GetResourceState('qbx_core') == 'started' then
        local ok, player = pcall(function()
            return exports.qbx_core:GetPlayerByCitizenId(citizenid)
        end)
        if ok and player and player.PlayerData and player.PlayerData.source then
            return identityFromOnline(player.PlayerData.source)
        end
    end
    for _, sid in ipairs(GetPlayers()) do
        local target = identityFromOnline(sid)
        if target and target.citizenid == citizenid then
            return target
        end
    end
    return nil
end

local function findOnlineByDiscord(discord)
    local want = normalizeDiscord(discord)
    if want == '' then
        return nil
    end
    for _, sid in ipairs(GetPlayers()) do
        local target = identityFromOnline(sid)
        if target and normalizeDiscord(target.discord) == want then
            return target
        end
    end
    return nil
end

local function mergeIdentity(base, extra)
    if type(extra) ~= 'table' then
        return base
    end
    base.playerId = base.playerId or extra.playerId
    if (not base.name or base.name == '') and extra.name and extra.name ~= '' then
        base.name = extra.name
    end
    if extra.citizenid and extra.citizenid ~= '' then
        base.citizenid = extra.citizenid
    end
    if extra.license and extra.license ~= '' then
        base.license = extra.license
    end
    if extra.license2 and extra.license2 ~= '' then
        base.license2 = extra.license2
    end
    if extra.discord and extra.discord ~= '' then
        base.discord = extra.discord
    end
    return base
end

local function resolveWarnTarget(fields)
    local query = trimQuery(fields.identifier or fields.playerId or fields.citizenid or fields.discord)
    if query == '' then
        return nil, 'Informe o Citizen ID ou o ID do Discord.'
    end

    local target = {
        playerId = nil,
        name = query,
        citizenid = '',
        license = '',
        license2 = '',
        discord = '',
    }

    if isDiscordId(query) then
        target.discord = normalizeDiscord(query)
        target = mergeIdentity(target, findOnlineByDiscord(query))
    else
        local numeric = tonumber(query)
        if numeric and not isDiscordId(query) and GetPlayerName(numeric) then
            return identityFromOnline(numeric)
        end
        target.citizenid = query
        target = mergeIdentity(target, findOnlineByCitizenId(query))
    end

    if target.playerId then
        return target
    end

    if GetResourceState('qbx_core') == 'started' and target.citizenid ~= '' then
        local ok, offline = pcall(function()
            return exports.qbx_core:GetOfflinePlayer(target.citizenid)
        end)
        if ok and offline and offline.PlayerData then
            local data = offline.PlayerData
            target = mergeIdentity(target, {
                name = nameFromCharinfo(data.charinfo, data.name or target.name),
                citizenid = data.citizenid or target.citizenid,
                license = data.license or '',
            })
        end
    end

    if GetResourceState('oxmysql') == 'started' then
        if target.citizenid ~= '' then
            local row = mysqlSingle('SELECT citizenid, license, name, charinfo FROM players WHERE citizenid = ? LIMIT 1', { target.citizenid })
            if type(row) == 'table' then
                target = mergeIdentity(target, {
                    name = nameFromCharinfo(row.charinfo, row.name or target.name),
                    citizenid = row.citizenid or target.citizenid,
                    license = row.license or '',
                })
            end
        end

        ensureBanIdTable()
        local discord = target.discord
        local row = mysqlSingle([[
            SELECT citizenid, license, license2, discord, name
            FROM sunville_ban_ids
            WHERE citizenid = ? OR discord = ? OR discord = ?
            LIMIT 1
        ]], { target.citizenid, discord, discord ~= '' and discord:gsub('^discord:', '') or '' })
        if type(row) == 'table' then
            target = mergeIdentity(target, row)
        end
    end

    if target.discord ~= '' or target.citizenid ~= '' then
        if target.name == query and target.citizenid ~= '' then
            target.name = target.citizenid
        end
        return target
    end

    return nil, ('Jogador não encontrado para "%s". Use Citizen ID ou ID do Discord.'):format(query)
end

ensureBanIdTable = function()
    if GetResourceState('oxmysql') ~= 'started' then
        return false
    end
    local done = promise.new()
    exports.oxmysql:execute([[
        CREATE TABLE IF NOT EXISTS sunville_ban_ids (
            id INT NOT NULL AUTO_INCREMENT,
            citizenid VARCHAR(50) NULL,
            license VARCHAR(80) NULL,
            license2 VARCHAR(80) NULL,
            discord VARCHAR(80) NULL,
            name VARCHAR(80) NULL,
            PRIMARY KEY (id)
        )
    ]], {}, function()
        done:resolve(true)
    end)
    Citizen.Await(done)
    return true
end

local function insertBanRow(name, license, discord, ip, reason, expire)
    if not license or license == '' then
        return
    end
    exports.oxmysql:insert(
        'INSERT INTO bans (name, license, discord, ip, reason, expire, bannedby) VALUES (?, ?, ?, ?, ?, ?, ?)',
        { name, license, discord or '', ip or '', reason, expire, 'Sunville Discord' }
    )
end

CommandHandlers.ban_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local reason = fields.reason ~= '' and fields.reason or 'Banido pela staff'
    local duration = banSecondsFromDays(fields.duration)
    local expire = duration >= 2147483647 and 2147483647 or (os.time() + duration)
    local name = GetPlayerName(id)
    local identifiers = collectBanIdentifiers(id)
    local player = BridgeGetPlayer(id)
    local citizenid = player and player.PlayerData and player.PlayerData.citizenid or ''
    if player and player.PlayerData and player.PlayerData.charinfo then
        local info = player.PlayerData.charinfo
        local fullName = ((info.firstname or '') .. ' ' .. (info.lastname or '')):gsub('^%s+', ''):gsub('%s+$', '')
        if fullName ~= '' then
            name = fullName
        end
    end

    if GetResourceState('oxmysql') == 'started' then
        insertBanRow(name, identifiers.license, identifiers.discord, identifiers.ip, reason, expire)
        if identifiers.license2 ~= '' and identifiers.license2 ~= identifiers.license then
            insertBanRow(name, identifiers.license2, identifiers.discord, identifiers.ip, reason, expire)
        end
        if ensureBanIdTable() then
            exports.oxmysql:insert(
                'INSERT INTO sunville_ban_ids (citizenid, license, license2, discord, name) VALUES (?, ?, ?, ?, ?)',
                { citizenid, identifiers.license, identifiers.license2, identifiers.discord, name }
            )
        end
    end

    DropPlayer(id, ('Você foi banido.\nMotivo: %s'):format(reason))
    return {
        message = ('Jogador %s banido.'):format(name or id),
        announce = {
            type = 'ban',
            playerId = id,
            name = name or tostring(id),
            reason = reason,
            duration = duration,
            durationLabel = durationLabel(duration),
            expire = expire,
            citizenid = citizenid,
            license = identifiers.license,
            license2 = identifiers.license2,
            discord = identifiers.discord,
            ip = identifiers.ip,
        },
    }
end

CommandHandlers.advertencia_player = function(fields)
    local target, err = resolveWarnTarget(fields)
    if not target then return nil, err end
    local reason = fields.reason ~= '' and fields.reason or 'Advertência da staff'

    if target.playerId then
        BridgeNotify(target.playerId, ('Você recebeu uma advertência (acumula até 3).\nMotivo: %s'):format(reason), 'error', 60000)
    end

    return {
        message = ('Advertência aplicada em %s.'):format(target.name),
        announce = {
            type = 'warn',
            playerId = target.playerId or '',
            name = target.name,
            reason = reason,
            citizenid = target.citizenid or '',
            license = target.license or '',
            license2 = target.license2 or '',
            discord = target.discord or '',
        },
    }
end

CommandHandlers.remove_advertencia = function(fields)
    local target, err = resolveWarnTarget(fields)
    if not target then return nil, err end
    local reason = fields.reason ~= '' and fields.reason or 'Advertência removida pela staff'

    if target.playerId then
        BridgeNotify(target.playerId, ('Uma advertência foi removida.\nMotivo: %s'):format(reason), 'inform', 60000)
    end

    return {
        message = ('Advertência removida de %s.'):format(target.name),
        announce = {
            type = 'unwarn',
            playerId = target.playerId or '',
            name = target.name,
            reason = reason,
            citizenid = target.citizenid or '',
            license = target.license or '',
            license2 = target.license2 or '',
            discord = target.discord or '',
        },
    }
end

mysqlSingle = function(query, params)
    if type(exports.oxmysql.single_async) == 'function' then
        return exports.oxmysql:single_async(query, params)
    end
    local p = promise.new()
    exports.oxmysql:single(query, params, function(result)
        p:resolve(result)
    end)
    return Citizen.Await(p)
end

mysqlExecute = function(query, params)
    if type(exports.oxmysql.execute_async) == 'function' then
        return exports.oxmysql:execute_async(query, params)
    end
    local p = promise.new()
    exports.oxmysql:execute(query, params, function(result)
        p:resolve(result)
    end)
    return Citizen.Await(p)
end

local function unbanVariants(query)
    local values = { query }
    if not query:find(':', 1, true) then
        values[#values + 1] = 'license:' .. query
        values[#values + 1] = 'license2:' .. query
        values[#values + 1] = 'discord:' .. query
    end
    return values
end

local function deleteBansByIdentifiers(row)
    if type(row) ~= 'table' then
        return
    end
    if row.license and row.license ~= '' then
        mysqlExecute('DELETE FROM bans WHERE license = ?', { row.license })
        pcall(function()
            if GetResourceState('qbx_core') == 'started' then
                exports.qbx_core:Unban(row.license)
            end
        end)
    end
    if row.license2 and row.license2 ~= '' then
        mysqlExecute('DELETE FROM bans WHERE license = ?', { row.license2 })
        pcall(function()
            if GetResourceState('qbx_core') == 'started' then
                exports.qbx_core:Unban(row.license2)
            end
        end)
    end
    if row.discord and row.discord ~= '' then
        mysqlExecute('DELETE FROM bans WHERE discord = ?', { row.discord })
    end
end

CommandHandlers.unban_player = function(fields)
    local query = tostring(fields.identifier or fields.license or fields.discord or fields.citizenid or fields.name or '')
    query = query:gsub('^%s+', ''):gsub('%s+$', '')
    if query == '' then
        return nil, 'Informe o Discord, a license ou o Citizen ID.'
    end

    if GetResourceState('oxmysql') ~= 'started' then
        return nil, 'oxmysql não está iniciado. Não foi possível desbanir.'
    end

    ensureBanIdTable()
    local variants = unbanVariants(query)
    local row = mysqlSingle([[
        SELECT name, citizenid, license, license2, discord
        FROM sunville_ban_ids
        WHERE citizenid = ? OR license = ? OR license2 = ? OR discord = ?
           OR license = ? OR license2 = ? OR discord = ?
        LIMIT 1
    ]], {
        query,
        query,
        query,
        query,
        variants[2] or query,
        variants[3] or query,
        variants[4] or query,
    })

    if type(row) ~= 'table' then
        row = mysqlSingle([[
            SELECT name, license, discord FROM bans
            WHERE license = ? OR license = ? OR license = ? OR license = ?
               OR discord = ? OR discord = ? OR name = ?
            LIMIT 1
        ]], {
            query,
            variants[2] or query,
            variants[3] or query,
            variants[4] or query,
            query,
            variants[4] or ('discord:' .. query),
            query,
        })
    end

    if type(row) ~= 'table' then
        local playerRow = mysqlSingle('SELECT citizenid, license FROM players WHERE citizenid = ? LIMIT 1', { query })
        if type(playerRow) == 'table' and playerRow.license and playerRow.license ~= '' then
            row = mysqlSingle('SELECT name, license, discord FROM bans WHERE license = ? LIMIT 1', { playerRow.license })
            if type(row) ~= 'table' then
                row = {
                    name = query,
                    citizenid = playerRow.citizenid,
                    license = playerRow.license,
                }
            else
                row.citizenid = playerRow.citizenid
            end
        end
    end

    if type(row) == 'table' and (not row.license2 or row.license2 == '' or not row.citizenid or row.citizenid == '') then
        local extra = mysqlSingle([[
            SELECT citizenid, license, license2, discord, name
            FROM sunville_ban_ids
            WHERE license = ? OR discord = ? OR name = ? OR citizenid = ?
            LIMIT 1
        ]], { row.license or '', row.discord or '', row.name or '', row.citizenid or query })
        if type(extra) == 'table' then
            row.citizenid = row.citizenid ~= '' and row.citizenid or extra.citizenid
            row.license = row.license ~= '' and row.license or extra.license
            row.license2 = row.license2 ~= '' and row.license2 or extra.license2
            row.discord = row.discord ~= '' and row.discord or extra.discord
            row.name = row.name or extra.name
        end
    end

    if type(row) ~= 'table' or (not row.license and not row.license2 and not row.discord and not row.citizenid) then
        return nil, ('Nenhum ban encontrado para "%s".'):format(query)
    end

    deleteBansByIdentifiers(row)
    mysqlExecute([[
        DELETE FROM sunville_ban_ids
        WHERE citizenid = ? OR license = ? OR license2 = ? OR discord = ?
    ]], { row.citizenid or '', row.license or '', row.license2 or '', row.discord or '' })

    local reason = tostring(fields.reason or '')
    if reason == '' then
        reason = 'Desbanido pela staff'
    end

    return {
        message = ('Jogador %s desbanido.'):format(row.name or row.citizenid or row.license or query),
        announce = {
            type = 'unban',
            name = row.name or query,
            reason = reason,
            citizenid = row.citizenid or '',
            license = row.license or '',
            license2 = row.license2 or '',
            discord = row.discord or '',
        },
    }
end

local function dash(value)
    if value == nil or value == '' then
        return '—'
    end
    return tostring(value)
end

local function moneyOf(player, account)
    if player.Functions and player.Functions.GetMoney then
        local ok, amount = pcall(player.Functions.GetMoney, player.Functions, account)
        if ok and amount ~= nil then
            return tonumber(amount) or 0
        end
    end
    local money = player.PlayerData and player.PlayerData.money or {}
    return tonumber(money[account]) or 0
end

local function formatGroup(data)
    if type(data) ~= 'table' then
        return '—'
    end
    local grade = data.grade
    local gradeText = tostring(data.grade and (type(grade) == 'table' and (grade.name or grade.level) or grade) or 0)
    local label = data.label or data.name or '—'
    local name = data.name or '—'
    local duty = ''
    if data.onduty == false then
        duty = ' • folga'
    elseif data.onduty == true then
        duty = ' • serviço'
    end
    return ('%s (`%s`) grade %s%s'):format(label, name, gradeText, duty)
end

local function collectIdentifiers(playerId)
    local found = { license = '', discord = '', steam = '', fivem = '', ip = '' }
    for i = 0, GetNumPlayerIdentifiers(playerId) - 1 do
        local identifier = GetPlayerIdentifier(playerId, i) or ''
        if identifier:find('license:', 1, true) and found.license == '' then
            found.license = identifier
        elseif identifier:find('discord:', 1, true) then
            found.discord = identifier
        elseif identifier:find('steam:', 1, true) then
            found.steam = identifier
        elseif identifier:find('fivem:', 1, true) then
            found.fivem = identifier
        elseif identifier:find('ip:', 1, true) then
            found.ip = identifier
        end
    end
    return found
end

local function embedField(name, value, inline)
    return {
        name = tostring(name):sub(1, 256),
        value = dash(value):sub(1, 1024),
        inline = inline ~= false,
    }
end

local function decodeJson(value)
    if type(value) == 'table' then
        return value
    end
    if type(value) ~= 'string' or value == '' then
        return {}
    end
    local ok, decoded = pcall(json.decode, value)
    if ok and type(decoded) == 'table' then
        return decoded
    end
    return {}
end

local function genderLabel(gender)
    if gender == 0 or gender == '0' or gender == 'm' then
        return 'Masculino'
    end
    if gender == 1 or gender == '1' or gender == 'f' then
        return 'Feminino'
    end
    return dash(gender)
end

local function findCitizenByDiscord(discordRaw)
    if GetResourceState('oxmysql') ~= 'started' then
        return nil
    end
    local id = tostring(discordRaw or ''):gsub('^discord:', '')
    if id == '' then
        return nil
    end
    local prefixed = 'discord:' .. id

    local okPlayers, playerRow = pcall(function()
        return mysqlSingle('SELECT citizenid FROM players WHERE discord = ? OR discord = ? LIMIT 1', { prefixed, id })
    end)
    if okPlayers and type(playerRow) == 'table' and playerRow.citizenid and playerRow.citizenid ~= '' then
        return playerRow.citizenid
    end

    ensureBanIdTable()
    local banRow = mysqlSingle([[
        SELECT citizenid FROM sunville_ban_ids
        WHERE (discord = ? OR discord = ?) AND citizenid IS NOT NULL AND citizenid <> ''
        LIMIT 1
    ]], { prefixed, id })
    if type(banRow) == 'table' and banRow.citizenid and banRow.citizenid ~= '' then
        return banRow.citizenid
    end

    local okUsers, userRow = pcall(function()
        return mysqlSingle([[
            SELECT license, license2 FROM users
            WHERE discord = ? OR discord = ? OR REPLACE(IFNULL(discord, ''), 'discord:', '') = ?
            LIMIT 1
        ]], { prefixed, id, id })
    end)
    if not okUsers or type(userRow) ~= 'table' then
        return nil
    end

    local licenses = {}
    for _, key in ipairs({ 'license', 'license2' }) do
        local value = userRow[key]
        if value and value ~= '' then
            local bare = tostring(value):gsub('^license2:', ''):gsub('^license:', '')
            licenses[#licenses + 1] = value
            licenses[#licenses + 1] = 'license:' .. bare
            licenses[#licenses + 1] = 'license2:' .. bare
            licenses[#licenses + 1] = bare
        end
    end
    if #licenses == 0 then
        return nil
    end
    local marks = {}
    for i = 1, #licenses do
        marks[i] = '?'
    end
    local found = mysqlSingle(
        ('SELECT citizenid FROM players WHERE license IN (%s) LIMIT 1'):format(table.concat(marks, ',')),
        licenses
    )
    if type(found) == 'table' and found.citizenid and found.citizenid ~= '' then
        return found.citizenid
    end
    return nil
end

local function lookupDiscord(citizenid, license)
    if GetResourceState('oxmysql') ~= 'started' then
        return ''
    end
    ensureBanIdTable()
    local row = mysqlSingle([[
        SELECT discord FROM sunville_ban_ids
        WHERE citizenid = ? AND discord IS NOT NULL AND discord <> ''
        LIMIT 1
    ]], { citizenid or '' })
    if type(row) == 'table' and row.discord and row.discord ~= '' then
        return row.discord
    end
    if not license or license == '' then
        return ''
    end
    local bare = tostring(license):gsub('^license2:', ''):gsub('^license:', '')
    local ok, user = pcall(function()
        return mysqlSingle([[
            SELECT discord FROM users
            WHERE license IN (?, ?, ?) OR license2 IN (?, ?, ?)
            LIMIT 1
        ]], { license, 'license:' .. bare, 'license2:' .. bare, license, 'license:' .. bare, 'license2:' .. bare })
    end)
    if ok and type(user) == 'table' and user.discord and user.discord ~= '' then
        return user.discord
    end
    return ''
end

local function loadOfflinePlayer(citizenid)
    if GetResourceState('oxmysql') ~= 'started' or not citizenid or citizenid == '' then
        return nil
    end
    local ok, row = pcall(function()
        return mysqlSingle([[
            SELECT citizenid, cid, license, name, money, charinfo, job, gang, position, metadata
            FROM players WHERE citizenid = ? LIMIT 1
        ]], { citizenid })
    end)
    if ok and type(row) == 'table' then
        return row
    end
    return nil
end

local function playerInfoResult(data, extra)
    local info = decodeJson(data.charinfo)
    local meta = decodeJson(data.metadata)
    local fullName = nameFromCharinfo(info, data.name or extra.fallbackName)
    local discordRaw = extra.discord or ''
    local discordId = tostring(discordRaw):gsub('^discord:', '')
    local discordMention = discordId ~= '' and ('<@%s>'):format(discordId) or '—'
    local coords = extra.coords or '—'
    local money = extra.money
    if not money then
        local stored = decodeJson(data.money)
        money = ('$%s / $%s / %s'):format(dash(stored.cash), dash(stored.bank), dash(stored.crypto))
    end

    return {
        message = ('Informações de **%s** (%s).'):format(fullName, extra.status),
        fields = {
            embedField('Nome', fullName, true),
            embedField('CitizenID', data.citizenid, true),
            embedField('CID', data.cid, true),
            embedField('Nascimento', info.birthdate, true),
            embedField('Nacionalidade', info.nationality, true),
            embedField('Gênero', genderLabel(info.gender), true),
            embedField('Telefone', info.phone, true),
            embedField('Conta', info.account, true),
            embedField('Mão / Banco / Crypto', money, false),
            embedField('Emprego', formatGroup(decodeJson(data.job)), false),
            embedField('Gangue', formatGroup(decodeJson(data.gang)), false),
            embedField('Fome / Sede / Stress', ('%s / %s / %s'):format(dash(meta.hunger), dash(meta.thirst), dash(meta.stress)), true),
            embedField('Ping', extra.ping or '—', true),
            embedField('Coords', coords, false),
            embedField('License', extra.license or data.license, false),
            embedField('Discord', ('%s\n%s'):format(discordMention, dash(discordRaw)), false),
            embedField('Steam', extra.steam, false),
            embedField('FiveM', extra.fivem, true),
            embedField('IP', extra.ip, true),
        },
    }
end

local function infoFromOnline(id, fallbackDiscord)
    local player = BridgeGetPlayer(id)
    if not player or not player.PlayerData then
        return nil, 'Jogador não encontrado no framework.'
    end
    local data = player.PlayerData
    local identifiers = collectIdentifiers(id)
    local ped = GetPlayerPed(id)
    local coords = GetEntityCoords(ped)
    local discord = identifiers.discord ~= '' and identifiers.discord or (fallbackDiscord or '')
    return playerInfoResult(data, {
        status = ('online • ID %s'):format(id),
        fallbackName = GetPlayerName(id),
        discord = discord,
        license = identifiers.license,
        steam = identifiers.steam,
        fivem = identifiers.fivem,
        ip = identifiers.ip,
        ping = GetPlayerPing(id) .. ' ms',
        coords = ('%.2f, %.2f, %.2f'):format(coords.x, coords.y, coords.z),
        money = ('$%s / $%s / %s'):format(moneyOf(player, 'cash'), moneyOf(player, 'bank'), moneyOf(player, 'crypto')),
    })
end

local function infoFromCitizen(citizenid, fallbackDiscord)
    local row = loadOfflinePlayer(citizenid)
    if not row then
        return nil, ('Personagem %s não está no banco.'):format(citizenid)
    end
    local position = decodeJson(row.position)
    local coords = '—'
    if position.x and position.y and position.z then
        coords = ('%.2f, %.2f, %.2f'):format(position.x, position.y, position.z)
    end
    local discord = fallbackDiscord
    if not discord or discord == '' then
        discord = lookupDiscord(row.citizenid, row.license)
    end
    return playerInfoResult(row, {
        status = 'offline',
        fallbackName = row.name,
        discord = discord,
        license = row.license,
        ping = 'Offline',
        coords = coords,
    })
end

local function resolvePlayerLookup(query)
    query = trimQuery(query)
    if query == '' then
        return nil, 'Informe o ID, o Citizen ID ou o ID do Discord.'
    end

    local function packOnline(id, discord)
        local player = BridgeGetPlayer(id)
        local data = player and player.PlayerData or {}
        return {
            source = id,
            citizenid = data.citizenid or '',
            name = GetPlayerName(id),
            discord = discord or '',
        }
    end

    local function onlineByCitizen(citizenid)
        local found = findOnlineByCitizenId(citizenid)
        if found and found.playerId then
            return packOnline(found.playerId)
        end
        return nil
    end

    if isDiscordId(query) then
        local online = findOnlineByDiscord(query)
        if online and online.playerId then
            return packOnline(online.playerId, normalizeDiscord(query))
        end
        local citizenid = findCitizenByDiscord(query)
        if not citizenid then
            return nil, ('Nenhum jogador encontrado para o Discord %s.'):format(query:gsub('^discord:', ''))
        end
        local stillOnline = onlineByCitizen(citizenid)
        if stillOnline then
            stillOnline.discord = normalizeDiscord(query)
            return stillOnline
        end
        return { citizenid = citizenid, discord = normalizeDiscord(query) }
    end

    local numeric = tonumber(query)
    if numeric and numeric > 0 and numeric < 100000 and GetPlayerName(numeric) then
        return packOnline(numeric)
    end

    local hit = onlineByCitizen(query)
    if hit then return hit end
    local upper = query:upper()
    if upper ~= query then
        hit = onlineByCitizen(upper)
        if hit then return hit end
    end

    if GetResourceState('oxmysql') ~= 'started' then
        return nil, 'Jogador não está online e o banco não está disponível.'
    end

    local row = loadOfflinePlayer(query) or (upper ~= query and loadOfflinePlayer(upper) or nil)
    if row then
        hit = onlineByCitizen(row.citizenid)
        if hit then return hit end
        return { citizenid = row.citizenid, name = row.name, license = row.license }
    end

    if numeric then
        return nil, ('ID %s não está online. Para consultar offline, use o Citizen ID ou o Discord.'):format(query)
    end
    return nil, ('Jogador não encontrado para "%s".'):format(query)
end

CommandHandlers.view_player_info = function(fields)
    local found, err = resolvePlayerLookup(fields.playerId or fields.identifier or fields.citizenid or fields.discord)
    if not found then return nil, err end
    if found.source then
        return infoFromOnline(found.source, found.discord)
    end
    return infoFromCitizen(found.citizenid, found.discord)
end

local function itemCount(item)
    return tonumber(item.count or item.amount or item.quantity) or 1
end

local function itemLabel(item)
    local label = item.label or item.name or 'item'
    local name = item.name or label
    if label ~= name then
        return ('%s (`%s`)'):format(label, name)
    end
    return ('`%s`'):format(name)
end

local function inventoryLines(items)
    local lines = {}
    if type(items) ~= 'table' then
        return lines, 0
    end

    local list = {}
    for slot, item in pairs(items) do
        if type(item) == 'table' and (item.name or item.label) then
            list[#list + 1] = {
                slot = tonumber(item.slot or slot) or 0,
                name = item.name or item.label,
                label = itemLabel(item),
                count = itemCount(item),
                metadata = item.metadata or item.info,
            }
        end
    end

    table.sort(list, function(a, b)
        if a.slot == b.slot then
            return tostring(a.name) < tostring(b.name)
        end
        return a.slot < b.slot
    end)

    local total = 0
    for _, item in ipairs(list) do
        total = total + item.count
        local extra = ''
        if type(item.metadata) == 'table' then
            if item.metadata.ammo then
                extra = (' • munição %s'):format(item.metadata.ammo)
            elseif item.metadata.serial then
                extra = (' • série %s'):format(item.metadata.serial)
            end
        end
        lines[#lines + 1] = ('• [%s] %s x%s%s'):format(item.slot, item.label, item.count, extra)
    end

    return lines, total
end

local function collectInventory(playerId, player)
    local items = nil

    if GetResourceState('ox_inventory') == 'started' then
        pcall(function()
            items = exports.ox_inventory:GetInventoryItems(playerId)
        end)
        if type(items) ~= 'table' then
            pcall(function()
                local inventory = exports.ox_inventory:GetInventory(playerId)
                if type(inventory) == 'table' then
                    items = inventory.items or inventory
                end
            end)
        end
    end

    if type(items) ~= 'table' and player and player.PlayerData then
        items = player.PlayerData.items
    end

    return inventoryLines(items)
end

local function loadStoredItems(citizenid)
    if GetResourceState('oxmysql') ~= 'started' or not citizenid or citizenid == '' then
        return nil
    end
    local ok, row = pcall(function()
        return mysqlSingle('SELECT inventory FROM players WHERE citizenid = ? LIMIT 1', { citizenid })
    end)
    if ok and type(row) == 'table' and row.inventory and row.inventory ~= '' and row.inventory ~= '[]' then
        local items = decodeJson(row.inventory)
        if type(items) == 'table' and type(items.items) == 'table' then
            items = items.items
        end
        if type(items) == 'table' then
            return items
        end
    end
    local okOx, oxRow = pcall(function()
        return mysqlSingle('SELECT data FROM ox_inventory WHERE owner = ? LIMIT 1', { citizenid })
    end)
    if okOx and type(oxRow) == 'table' and oxRow.data and oxRow.data ~= '' then
        local items = decodeJson(oxRow.data)
        if type(items) == 'table' then
            return items
        end
    end
    return {}
end

local function inventoryMessage(fullName, status, lines, total)
    if #lines == 0 then
        return {
            message = ('Inventário de **%s** (%s) está vazio.'):format(fullName, status),
            lines = { 'Nenhum item encontrado.' },
        }
    end
    return {
        message = ('Inventário de **%s** (%s) — **%s** tipos / **%s** itens.'):format(fullName, status, #lines, total),
        lines = lines,
    }
end

CommandHandlers.view_inventory = function(fields)
    local found, err = resolvePlayerLookup(fields.playerId or fields.identifier or fields.citizenid or fields.discord)
    if not found then return nil, err end

    if found.source then
        local player = BridgeGetPlayer(found.source)
        local info = player and player.PlayerData and player.PlayerData.charinfo or {}
        local fullName = nameFromCharinfo(info, GetPlayerName(found.source) or ('ID ' .. tostring(found.source)))
        local lines, total = collectInventory(found.source, player)
        return inventoryMessage(fullName, ('online • ID %s'):format(found.source), lines, total)
    end

    local row = loadOfflinePlayer(found.citizenid)
    local fullName = nameFromCharinfo(row and row.charinfo, (row and row.name) or found.name or found.citizenid)
    local lines, total = inventoryLines(loadStoredItems(found.citizenid))
    return inventoryMessage(fullName, 'offline', lines, total)
end

CommandHandlers.mute_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local state = Player(id).state
    local muted = not state.sunvilleMuted
    MumbleSetPlayerMuted(id, muted)
    state:set('sunvilleMuted', muted, false)
    BridgeNotify(id, muted and 'Você foi silenciado pela staff.' or 'Seu microfone foi liberado pela staff.', muted and 'error' or 'success')
    return { message = muted and ('Jogador %s silenciado.'):format(id) or ('Jogador %s pode falar de novo.'):format(id) }
end

CommandHandlers.toggle_cuffs = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if GetResourceState('ND_Police') == 'started' then
        if Player(id).state.isCuffed then
            TriggerClientEvent('ND_Police:uncuffPed', id)
            return { message = ('Jogador %s desalgemado.'):format(id) }
        end
        TriggerClientEvent('ND_Police:syncNormalCuff', id, 'front', 'cuffs')
        return { message = ('Jogador %s algemado.'):format(id) }
    end
    TriggerClientEvent('police:client:GetCuffed', id, id)
    return { message = ('Algemas alternadas em %s.'):format(id) }
end

CommandHandlers.set_bucket = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local bucket = tonumber(fields.bucket)
    if bucket == nil then
        return nil, 'Bucket inválido.'
    end
    SetPlayerRoutingBucket(id, bucket)
    return { message = ('Jogador %s movido para o bucket %s.'):format(id, bucket) }
end

CommandHandlers.get_bucket = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local bucket = GetPlayerRoutingBucket(id)
    return { message = ('Jogador %s está no bucket %s.'):format(id, bucket), bucket = bucket }
end

-- Os eventos do mri_Qadmin conferem a permissão do próprio jogador no client:
-- só funcionam em quem é staff in-game.
local function requireQadmin()
    if GetResourceState('mri_Qadmin') ~= 'started' then
        return nil, 'O mri_Qadmin não está iniciado no servidor.'
    end
    return true
end

CommandHandlers.god_mode = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local ok, qErr = requireQadmin()
    if not ok then return nil, qErr end
    TriggerClientEvent('mri_Qadmin:client:ToggleGodmode', id, 'god_mode')
    return { message = ('Godmode alternado em %s (só funciona se ele for staff in-game).'):format(id) }
end

CommandHandlers.invisible = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local ok, qErr = requireQadmin()
    if not ok then return nil, qErr end
    TriggerClientEvent('mri_Qadmin:client:ToggleInvisible', id, 'invisible')
    return { message = ('Invisibilidade alternada em %s (só funciona se ele for staff in-game).'):format(id) }
end

CommandHandlers.noclip = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local ok, qErr = requireQadmin()
    if not ok then return nil, qErr end
    TriggerClientEvent('mri_Qadmin:client:ToggleNoClip', id)
    return { message = ('Noclip alternado em %s (só funciona se ele for staff in-game).'):format(id) }
end

CommandHandlers.infinite_ammo = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local ok, qErr = requireQadmin()
    if not ok then return nil, qErr end
    TriggerClientEvent('mri_Qadmin:client:setInfiniteAmmo', id, 'infinite_ammo')
    return { message = ('Munição infinita alternada em %s (só funciona se ele for staff in-game).'):format(id) }
end

CommandHandlers.set_ammo = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local ok, qErr = requireQadmin()
    if not ok then return nil, qErr end
    local amount = tonumber(fields.amount)
    if not amount or amount < 0 then return nil, 'Quantidade de munição inválida.' end
    TriggerClientEvent('mri_Qadmin:client:SetAmmo', id, 'set_ammo', {
        ['Ammo Ammount'] = { value = math.floor(amount) },
    })
    return { message = ('Munição de %s definida para %s (só funciona se ele for staff in-game).'):format(id, math.floor(amount)) }
end

CommandHandlers.bring_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local dest, destErr = BridgeRequireOnline(fields.targetId)
    if not dest then return nil, destErr end
    local ped = GetPlayerPed(dest)
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    SetEntityCoords(GetPlayerPed(id), coords.x, coords.y, coords.z, false, false, false, false)
    SetEntityHeading(GetPlayerPed(id), heading)
    return { message = ('Jogador %s puxado até %s.'):format(id, dest) }
end

CommandHandlers.teleport_to_player = function(fields)
    return CommandHandlers.bring_player({
        playerId = fields.playerId,
        targetId = fields.targetId,
    })
end

CommandHandlers.play_sound = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if GetResourceState('interact-sound') ~= 'started' then
        return nil, 'O resource interact-sound não está iniciado.'
    end
    local sound = tostring(fields.sound or ''):gsub('%s+', '')
    if sound == '' then sound = 'Alert' end
    if not sound:match('^[%w_%-]+$') then return nil, 'Nome de som inválido.' end
    TriggerClientEvent('InteractSound_CL:PlayOnOne', id, sound, 0.3)
    return { message = ('Som %s tocado para %s.'):format(sound, id) }
end

CommandHandlers.give_money = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local player = BridgeGetPlayer(id)
    if not player then return nil, 'Jogador não encontrado no framework.' end
    local amount = tonumber(fields.amount)
    local moneyType = fields.moneyType or 'cash'
    if not amount or amount < 1 then return nil, 'Valor inválido.' end
    player.Functions.AddMoney(moneyType, amount, 'sunville-discord')
    BridgeNotify(id, ('Você recebeu %s de %s.'):format(amount, moneyType), 'success')
    return { message = ('+%s %s para o jogador %s.'):format(amount, moneyType, id) }
end

CommandHandlers.remove_money = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local player = BridgeGetPlayer(id)
    if not player then return nil, 'Jogador não encontrado no framework.' end
    local amount = tonumber(fields.amount)
    local moneyType = fields.moneyType or 'cash'
    if not amount or amount < 1 then return nil, 'Valor inválido.' end
    player.Functions.RemoveMoney(moneyType, amount, 'sunville-discord')
    return { message = ('-%s %s do jogador %s.'):format(amount, moneyType, id) }
end

CommandHandlers.give_item = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if not fields.item or fields.item == '' then return nil, 'Informe o item.' end
    local amount = tonumber(fields.amount) or 1
    if not BridgeAddItem(id, fields.item, amount) then
        return nil, 'Não foi possível entregar o item.'
    end
    BridgeNotify(id, ('Você recebeu %sx %s.'):format(amount, fields.item), 'success')
    return { message = ('%sx %s entregue para %s.'):format(amount, fields.item, id) }
end

CommandHandlers.give_item_all = function(fields)
    if not fields.item or fields.item == '' then return nil, 'Informe o item.' end
    local amount = tonumber(fields.amount) or 1
    for _, id in ipairs(GetPlayers()) do
        BridgeAddItem(tonumber(id), fields.item, amount)
    end
    return { message = ('%sx %s entregue para todos.'):format(amount, fields.item) }
end

CommandHandlers.give_money_all = function(fields)
    local amount = tonumber(fields.amount)
    local moneyType = fields.moneyType or 'cash'
    if not amount or amount < 1 then return nil, 'Valor inválido.' end
    for _, id in ipairs(GetPlayers()) do
        local player = BridgeGetPlayer(tonumber(id))
        if player then
            player.Functions.AddMoney(moneyType, amount, 'sunville-discord')
        end
    end
    return { message = ('+%s %s para todos os jogadores.'):format(amount, moneyType) }
end

CommandHandlers.clear_inventory = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if GetResourceState('ox_inventory') == 'started' then
        exports.ox_inventory:ClearInventory(id)
    elseif GetResourceState('qb-inventory') == 'started' then
        exports['qb-inventory']:ClearInventory(id, nil)
    end
    return { message = ('Inventário de %s limpo.'):format(id) }
end

CommandHandlers.clear_inventory_offline = function(fields)
    local citizenId = fields.citizenId
    if not citizenId or citizenId == '' then return nil, 'Informe o Citizen ID.' end
    if GetResourceState('oxmysql') == 'started' then
        exports.oxmysql:update('UPDATE players SET inventory = ? WHERE citizenid = ?', { '[]', citizenId })
    end
    return { message = ('Inventário offline de %s limpo.'):format(citizenId) }
end

CommandHandlers.set_job = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local player = BridgeGetPlayer(id)
    if not player then return nil, 'Jogador não encontrado no framework.' end
    local job = fields.job
    local grade = tonumber(fields.grade) or 0
    if not job or job == '' then return nil, 'Informe o emprego.' end
    if GetResourceState('qbx_core') == 'started' then
        exports.qbx_core:SetJob(player.PlayerData.citizenid, job, grade)
    else
        player.Functions.SetJob(job, grade)
    end
    return { message = ('Emprego de %s definido para %s grade %s.'):format(id, job, grade) }
end

CommandHandlers.fire_job = function(fields)
    return CommandHandlers.set_job({
        playerId = fields.playerId,
        job = 'unemployed',
        grade = '0',
    })
end

CommandHandlers.set_gang = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local player = BridgeGetPlayer(id)
    if not player then return nil, 'Jogador não encontrado no framework.' end
    local gang = fields.gang
    local grade = tonumber(fields.grade) or 0
    if not gang or gang == '' then return nil, 'Informe a gangue.' end
    if GetResourceState('qbx_core') == 'started' then
        exports.qbx_core:SetGang(player.PlayerData.citizenid, gang, grade)
    else
        player.Functions.SetGang(gang, grade)
    end
    return { message = ('Gangue de %s definida para %s grade %s.'):format(id, gang, grade) }
end

CommandHandlers.fire_gang = function(fields)
    return CommandHandlers.set_gang({
        playerId = fields.playerId,
        gang = 'none',
        grade = '0',
    })
end

CommandHandlers.spawn_vehicle = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if not fields.model or fields.model == '' then return nil, 'Informe o modelo.' end
    local warp = not fields.warp or not tostring(fields.warp):lower():match('^n')
    local vehicle, spawnErr = spawnForPlayer(id, fields.model:lower(), fields.plate or '', warp)
    if not vehicle then return nil, spawnErr end
    return { message = ('Veículo %s spawnado para %s (placa %s).'):format(fields.model, id, vehicle.plate or '-') }
end

local function randomPlate()
    local chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    local plate = ''
    for _ = 1, 8 do
        local index = math.random(1, #chars)
        plate = plate .. chars:sub(index, index)
    end
    return plate
end

CommandHandlers.give_vehicle = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end

    local model = tostring(fields.model or ''):lower():gsub('%s+', '')
    if model == '' or not model:match('^[%w_]+$') then
        return nil, 'Informe um modelo válido.'
    end

    local player = BridgeGetPlayer(id)
    if not player or not player.PlayerData or not player.PlayerData.citizenid then
        return nil, 'Jogador não encontrado no framework.'
    end

    local citizenid = player.PlayerData.citizenid
    local garage = tostring(fields.garage or ''):gsub('%s+', '')
    if garage == '' then
        garage = 'pillboxgarage'
    end

    local plate = tostring(fields.plate or ''):upper():gsub('%s+', '')
    if plate == '' then
        plate = randomPlate()
    end
    if #plate > 8 then
        plate = plate:sub(1, 8)
    end

    if GetResourceState('qbx_vehicles') == 'started' then
        local vehicleId, createErr = exports.qbx_vehicles:CreatePlayerVehicle({
            model = model,
            citizenid = citizenid,
            garage = garage,
            props = { plate = plate },
        })
        if not vehicleId then
            local message = createErr
            if type(createErr) == 'table' then
                message = createErr.message or createErr.code
            end
            return nil, message and tostring(message) or 'Falha ao gravar o veículo na garagem.'
        end

        pcall(function()
            local info = exports.qbx_vehicles:GetPlayerVehicle(vehicleId)
            if type(info) == 'table' then
                if info.props and info.props.plate and info.props.plate ~= '' then
                    plate = info.props.plate
                elseif info.plate and info.plate ~= '' then
                    plate = info.plate
                end
            end
        end)

        BridgeNotify(id, ('Um %s foi adicionado na garagem %s. Placa %s.'):format(model, garage, plate), 'success')
        return {
            message = ('%s adicionado na garagem de %s (placa %s, garagem %s).'):format(model, id, plate, garage),
        }
    end

    if GetResourceState('oxmysql') ~= 'started' then
        return nil, 'qbx_vehicles e oxmysql não estão disponíveis.'
    end

    local license = player.PlayerData.license or ''
    mysqlExecute([[
        INSERT INTO player_vehicles
            (license, citizenid, vehicle, hash, mods, plate, garage, fuel, engine, body, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, 100, 1000, 1000, 1)
    ]], {
        license,
        citizenid,
        model,
        tostring(joaat(model)),
        json.encode({ plate = plate, model = joaat(model) }),
        plate,
        garage,
    })

    BridgeNotify(id, ('Um %s foi adicionado na garagem %s. Placa %s.'):format(model, garage, plate), 'success')
    return {
        message = ('%s adicionado na garagem de %s (placa %s, garagem %s).'):format(model, id, plate, garage),
    }
end

CommandHandlers.fix_vehicle_for = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if GetVehiclePedIsIn(GetPlayerPed(id), false) == 0 then
        return nil, 'O jogador não está em um veículo.'
    end
    TriggerClientEvent('iens:repaira', id)
    TriggerClientEvent('vehiclemod:client:fixEverything', id)
    TriggerClientEvent('sunville_bridge:client:refuel', id)
    return { message = ('Veículo de %s consertado e abastecido.'):format(id) }
end

CommandHandlers.fix_vehicle = CommandHandlers.fix_vehicle_for

CommandHandlers.refuel_vehicle = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if GetVehiclePedIsIn(GetPlayerPed(id), false) == 0 then
        return nil, 'O jogador não está em um veículo.'
    end
    TriggerClientEvent('sunville_bridge:client:refuel', id)
    return { message = ('Veículo de %s reabastecido.'):format(id) }
end

local pendingDeletes = {}

local function findClosestVehicle(coords, radius)
    local closest, closestDist
    local vehicles = GetAllVehicles()
    for i = 1, #vehicles do
        local veh = vehicles[i]
        if DoesEntityExist(veh) then
            local dist = #(GetEntityCoords(veh) - coords)
            if dist <= radius and (not closestDist or dist < closestDist) then
                closest = veh
                closestDist = dist
            end
        end
    end
    return closest
end

local function deleteVehicleEntity(vehicle)
    if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then
        return false
    end
    DeleteEntity(vehicle)
    return not DoesEntityExist(vehicle)
end

RegisterNetEvent('sunville_bridge:server:deleteNearbyResult', function(ok)
    local waiter = pendingDeletes[source]
    if not waiter then
        return
    end
    waiter.ok = ok and true or false
    waiter.done = true
end)

CommandHandlers.delete_vehicle = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end

    local radius = tonumber(fields.radius) or 8.0
    local ped = GetPlayerPed(id)
    local vehicle = GetVehiclePedIsIn(ped, false)
    if not vehicle or vehicle == 0 then
        vehicle = findClosestVehicle(GetEntityCoords(ped), radius)
    end

    local netId = nil
    if vehicle and vehicle ~= 0 and DoesEntityExist(vehicle) then
        netId = NetworkGetNetworkIdFromEntity(vehicle)
    end

    pendingDeletes[id] = { done = false, ok = false }
    TriggerClientEvent('sunville_bridge:client:deleteNearbyVehicle', id, radius, netId)

    if vehicle then
        deleteVehicleEntity(vehicle)
    end

    local timeout = GetGameTimer() + 3500
    while GetGameTimer() < timeout and not pendingDeletes[id].done do
        Wait(50)
    end

    local result = pendingDeletes[id]
    pendingDeletes[id] = nil

    if (result and result.ok) or (vehicle and not DoesEntityExist(vehicle)) then
        BridgeNotify(id, 'Veículo próximo removido.', 'success')
        return { message = ('Veículo próximo de %s removido.'):format(id) }
    end

    return nil, 'Nenhum veículo próximo encontrado.'
end

CommandHandlers.max_mods = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if GetVehiclePedIsIn(GetPlayerPed(id), false) == 0 then
        return nil, 'O jogador não está em um veículo.'
    end
    TriggerClientEvent('sunville_bridge:client:maxMods', id)
    return { message = ('Mods de desempenho maximizados no veículo de %s.'):format(id) }
end

CommandHandlers.change_plate = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if not fields.plate or fields.plate == '' then return nil, 'Informe a placa.' end
    local ped = GetPlayerPed(id)
    local vehicle = GetVehiclePedIsIn(ped, false)
    if not vehicle or vehicle == 0 then
        return nil, 'O jogador não está em um veículo.'
    end
    SetVehicleNumberPlateText(vehicle, fields.plate)
    return { message = ('Placa de %s alterada para %s.'):format(id, fields.plate) }
end

CommandHandlers.change_weather = function(fields)
    local weather = tostring(fields.weather or ''):gsub('%s+', ''):upper()
    if weather == '' then return nil, 'Informe o clima.' end
    local api, err = BridgeWeatherApi()
    if not api then return nil, err end
    if api:setWeather(weather) == false then
        return nil, ('Clima "%s" inválido. Ex.: EXTRASUNNY, CLEAR, CLOUDS, RAIN, THUNDER, FOGGY, SNOW, XMAS.'):format(weather)
    end
    return { message = ('Clima alterado para %s.'):format(weather) }
end

CommandHandlers.change_time = function(fields)
    local hour = tonumber(fields.hour)
    if not hour or hour < 0 or hour > 23 then return nil, 'Informe a hora (0-23).' end
    local api, err = BridgeWeatherApi()
    if not api then return nil, err end
    if api:setTime(math.floor(hour), 0) == false then
        return nil, 'O mri_Qweather recusou esse horário.'
    end
    return { message = ('Horário alterado para %02d:00.'):format(math.floor(hour)) }
end

CommandHandlers.blackout = function()
    local api, err = BridgeWeatherApi()
    if not api then return nil, err end
    local enabled = not api:getBlackoutState()
    api:setBlackout(enabled)
    return { message = enabled and 'Queda de energia ligada na cidade.' or 'Energia da cidade restaurada.' }
end

CommandHandlers.teleport_to_coords = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    local x, y, z = tostring(fields.coords or ''):match('([-%d%.]+)%s*,%s*([-%d%.]+)%s*,%s*([-%d%.]+)')
    if not x then return nil, 'Use o formato: x, y, z' end
    SetEntityCoords(GetPlayerPed(id), tonumber(x), tonumber(y), tonumber(z), false, false, false, false)
    return { message = ('Jogador %s teleportado para %s, %s, %s.'):format(id, x, y, z) }
end

local STAFF_ROLE_ORDER = { 'helper', 'support', 'mod', 'adm', 'admin2', 'admin' }
local STAFF_ROLE_LABELS = {
    helper = 'Helper',
    support = 'Suporte',
    mod = 'Moderador',
    adm = 'Adm',
    admin2 = 'Admin 2',
    admin = 'Admin',
}

local function normalizeStaffRole(value)
    local role = tostring(value or ''):lower():gsub('%s+', ''):gsub('^group%.', '')
    if role == 'suporte' then role = 'support' end
    if role == 'moderador' then role = 'mod' end
    return role
end

local function lookupDisplayName(found)
    if found.source then
        local player = BridgeGetPlayer(found.source)
        local info = player and player.PlayerData and player.PlayerData.charinfo
        return nameFromCharinfo(info, GetPlayerName(found.source) or ('ID ' .. tostring(found.source)))
    end
    local row = loadOfflinePlayer(found.citizenid)
    return nameFromCharinfo(row and row.charinfo, (row and row.name) or found.name or found.citizenid)
end

local function applyStaffRole(fields, role)
    local ok, qErr = requireQadmin()
    if not ok then return nil, qErr end

    local found, err = resolvePlayerLookup(fields.playerId or fields.identifier)
    if not found then return nil, err end
    if not found.citizenid or found.citizenid == '' then
        return nil, 'Não achei o personagem (Citizen ID) desse jogador.'
    end

    local called, groupId = pcall(function()
        return exports.mri_Qadmin:SetStaffRole(found.citizenid, role)
    end)
    if not called then
        return nil, ('Falha no mri_Qadmin: %s. Reinicie o mri_Qadmin para carregar o export SetStaffRole.'):format(tostring(groupId))
    end
    if groupId == false then
        return nil, 'O mri_Qadmin recusou esse cargo.'
    end

    return {
        name = lookupDisplayName(found),
        citizenid = found.citizenid,
        source = found.source,
        groupId = groupId,
    }
end

CommandHandlers.set_staff = function(fields)
    local role = normalizeStaffRole(fields.role)
    if not STAFF_ROLE_LABELS[role] then
        return nil, ('Cargo inválido. Use: %s.'):format(table.concat(STAFF_ROLE_ORDER, ', '))
    end

    local target, err = applyStaffRole(fields, role)
    if not target then return nil, err end

    local label = STAFF_ROLE_LABELS[role]
    if target.source then
        BridgeNotify(target.source, ('Você recebeu o cargo de staff: %s.'):format(label), 'success', 10000)
    end

    return {
        message = ('**%s** agora é **%s** in-game.'):format(target.name, label),
        fields = {
            embedField('Citizen ID', target.citizenid, true),
            embedField('Cargo', ('%s (`group.%s`)'):format(label, role), true),
            embedField('Grupo no painel', target.groupId, true),
            embedField('Status', target.source and ('online • ID %s (já aplicado)'):format(target.source) or 'offline • vale no próximo login', false),
        },
    }
end

CommandHandlers.remove_staff = function(fields)
    local target, err = applyStaffRole(fields, nil)
    if not target then return nil, err end

    if target.source then
        BridgeNotify(target.source, 'Seu cargo de staff foi removido.', 'inform', 10000)
    end

    return {
        message = ('Cargos de staff de **%s** removidos.'):format(target.name),
        fields = {
            embedField('Citizen ID', target.citizenid, true),
            embedField('Observação', 'Quem foi colocado como staff direto no server.cfg (add_principal) continua até tirar de lá.', false),
        },
    }
end

CommandHandlers.list_staff = function()
    if GetResourceState('oxmysql') ~= 'started' then
        return nil, 'oxmysql não está iniciado.'
    end
    local ok, rows = pcall(function()
        return exports.oxmysql:query_async([[
            SELECT cg.citizenid, cg.group_id, g.label, p.charinfo, p.name
            FROM mri_qadmin_character_groups cg
            LEFT JOIN mri_qadmin_groups g ON g.id = cg.group_id
            LEFT JOIN players p ON p.citizenid = cg.citizenid
            ORDER BY cg.group_id, cg.citizenid
        ]], {})
    end)
    if not ok then
        return nil, ('Não consegui ler os grupos do mri_Qadmin: %s'):format(tostring(rows))
    end

    local lines = {}
    for _, row in ipairs(rows or {}) do
        local name = nameFromCharinfo(row.charinfo, row.name or row.citizenid)
        local online = findOnlineByCitizenId(row.citizenid)
        lines[#lines + 1] = ('• **%s** (`%s`) — %s%s'):format(
            name,
            row.citizenid,
            row.label or row.group_id,
            online and (' • online ID %s'):format(online.playerId) or ''
        )
    end

    if #lines == 0 then
        return { message = 'Nenhum personagem está em grupo de staff do mri_Qadmin.' }
    end
    return {
        message = ('**%s** personagem(ns) em grupos de staff.'):format(#lines),
        linesTitle = 'Staff',
        lines = lines,
    }
end

CommandHandlers.screenshot_player = function(fields)
    local id, err = needPlayer(fields)
    if not id then return nil, err end
    if GetResourceState('screenshot-basic') ~= 'started' then
        return nil, 'O resource screenshot-basic não está iniciado.'
    end

    local p = promise.new()
    local settled = false
    local function settle(value)
        if settled then return end
        settled = true
        p:resolve(value)
    end

    exports['screenshot-basic']:requestClientScreenshot(id, {
        encoding = 'jpg',
        quality = 0.7,
    }, function(shotErr, data)
        settle({ err = shotErr, data = data })
    end)
    SetTimeout(12000, function()
        settle({ err = 'O jogo do jogador não respondeu a tempo.' })
    end)

    local shot = Citizen.Await(p)
    if shot.err then
        return nil, ('Não foi possível tirar o print: %s'):format(tostring(shot.err))
    end

    local base64 = type(shot.data) == 'string' and shot.data:match('^data:image/[%w%+]+;base64,(.+)$')
    if not base64 then
        return nil, 'O print voltou vazio.'
    end

    local player = BridgeGetPlayer(id)
    local info = player and player.PlayerData and player.PlayerData.charinfo
    local name = nameFromCharinfo(info, GetPlayerName(id) or ('ID ' .. id))

    return {
        message = ('Print da tela de **%s** (ID %s).'):format(name, id),
        image = {
            name = ('print-%s-%s.jpg'):format(id, os.time()),
            base64 = base64,
        },
    }
end

CommandHandlers.kick_all = function(fields)
    local reason = tostring(fields.reason or '')
    if reason == '' then
        reason = 'O servidor vai reiniciar. Volte em alguns minutos.'
    end
    local count = 0
    for _, id in ipairs(GetPlayers()) do
        DropPlayer(id, reason)
        count = count + 1
    end
    return { message = ('%s jogador(es) expulso(s). Motivo: %s'):format(count, reason) }
end

CommandHandlers.announce_all = function(fields)
    local text = tostring(fields.message or '')
    if text == '' then return nil, 'Escreva a mensagem do anúncio.' end
    if GetResourceState('ox_lib') == 'started' then
        TriggerClientEvent('ox_lib:notify', -1, {
            title = 'Anúncio da staff',
            description = text,
            type = 'inform',
            duration = 20000,
            showDuration = true,
        })
    else
        TriggerClientEvent('QBCore:Notify', -1, text, 'primary', 20000)
    end
    return { message = ('Anúncio enviado para %s jogador(es).'):format(#GetPlayers()) }
end

CommandHandlers.passlist_kick = function(fields)
    if GetResourceState('sunville_passlist') ~= 'started' then
        return nil, 'O sunville_passlist não está iniciado.'
    end
    local kicked = exports.sunville_passlist:kickIfRemoved(fields.userId)
    return { message = kicked and 'Jogador expulso da cidade (passlist removida).' or 'Nada a expulsar.' }
end

function ExecuteBridgeCommand(action, fields)
    local handler = CommandHandlers[action]
    if not handler then
        return nil, ('Ação "%s" não existe no bridge.'):format(tostring(action))
    end
    return handler(fields or {})
end

_G.ExecuteBridgeCommand = ExecuteBridgeCommand
_G.SunvilleCommandHandlers = CommandHandlers

exports('ExecuteBridgeCommand', ExecuteBridgeCommand)

print('^2[sunville_bridge] Comandos do painel carregados.^0')
