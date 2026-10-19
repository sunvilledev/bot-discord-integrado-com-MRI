local function identifierOf(src, idType)
    return GetPlayerIdentifierByType(src, idType)
end

local function addCandidate(list, value)
    if not value or value == '' then return end
    list[#list + 1] = value
    local hash = value:gsub('^[^:]+:', '')
    if hash ~= '' and hash ~= value then
        list[#list + 1] = hash
        list[#list + 1] = 'license:' .. hash
        list[#list + 1] = 'license2:' .. hash
        list[#list + 1] = 'discord:' .. hash
    end
end

local function unique(list)
    local seen, out = {}, {}
    for i = 1, #list do
        local value = list[i]
        if value and value ~= '' and not seen[value] then
            seen[value] = true
            out[#out + 1] = value
        end
    end
    return out
end

local function connectingIds(src)
    local ids = {}
    addCandidate(ids, identifierOf(src, 'license2'))
    addCandidate(ids, identifierOf(src, 'license'))
    addCandidate(ids, identifierOf(src, 'discord'))
    return unique(ids)
end

local function isPasslisted(value)
    if value == true or value == 1 or value == '1' then return true end
    return tonumber(value) == 1
end

local function fetchUser(src)
    local ids = connectingIds(src)
    if #ids == 0 then return nil end

    local placeholders = {}
    for i = 1, #ids do placeholders[i] = '?' end
    local inList = table.concat(placeholders, ',')

    local params = {}
    for _ = 1, 3 do
        for i = 1, #ids do
            params[#params + 1] = ids[i]
        end
    end

    return MySQL.single.await(([[
        SELECT userId, username, passlist, license, license2, discord
        FROM users
        WHERE license IN (%s)
           OR license2 IN (%s)
           OR discord IN (%s)
        LIMIT 1
    ]]):format(inList, inList, inList), params)
end

local function licenseVariants(raw)
    local value = tostring(raw or ''):gsub('%s+', '')
    if value == '' then return {} end
    local hash = value:gsub('^license2?:', '')
    local seen, out = {}, {}
    local function add(v)
        if v and v ~= '' and not seen[v] then
            seen[v] = true
            out[#out + 1] = v
        end
    end
    add(value)
    add(hash)
    add('license:' .. hash)
    add('license2:' .. hash)
    return out
end

local function sameIdentifier(a, b)
    if not a or not b or a == '' or b == '' then return false end
    if a == b then return true end
    local hashA = a:gsub('^[^:]+:', '')
    local hashB = b:gsub('^[^:]+:', '')
    return hashA ~= '' and hashA == hashB
end

local function onlineUserId(src)
    if GetResourceState('qbx_core') ~= 'started' then return nil end
    local ok, player = pcall(function()
        return exports.qbx_core:GetPlayer(src)
    end)
    if not ok or not player or not player.PlayerData then return nil end
    return tonumber(player.PlayerData.userId)
end

---Expulsa quem está na cidade quando a passlist é retirada.
---@param user { userId: number|string, license?: string, license2?: string, discord?: string }
local function kickRemoved(user)
    if not user then return end
    local userId = tonumber(user.userId)
    for _, id in ipairs(GetPlayers()) do
        local src = tonumber(id)
        if src then
            local match = userId and onlineUserId(src) == userId
            if not match then
                match = sameIdentifier(identifierOf(src, 'license'), user.license)
                    or sameIdentifier(identifierOf(src, 'license2'), user.license)
                    or sameIdentifier(identifierOf(src, 'license'), user.license2)
                    or sameIdentifier(identifierOf(src, 'license2'), user.license2)
                    or sameIdentifier(identifierOf(src, 'discord'), user.discord)
            end
            if match then
                local shown = identifierOf(src, 'license2') or user.license2 or user.license or identifierOf(src, 'license') or ''
                print(('[sunville_passlist] %s kickado: whitelist removida (userId %s)'):format(
                    GetPlayerName(src) or src,
                    user.userId
                ))
                DropPlayer(src, Config.KickNotListed:format(shown, Config.DiscordInvite))
            end
        end
    end
end

local function setPasslistByLicense(raw, allowed)
    local variants = licenseVariants(raw)
    if #variants == 0 then return false, nil end
    local placeholders = {}
    for i = 1, #variants do placeholders[i] = '?' end
    local inList = table.concat(placeholders, ',')
    local lookup = {}
    for i = 1, #variants do lookup[#lookup + 1] = variants[i] end
    for i = 1, #variants do lookup[#lookup + 1] = variants[i] end
    local user = MySQL.single.await(([[
        SELECT userId, license, license2, discord
        FROM users
        WHERE license IN (%s) OR license2 IN (%s)
        LIMIT 1
    ]]):format(inList, inList), lookup)
    if not user then return false end
    local params = { allowed and 1 or 0 }
    for i = 1, #lookup do params[#params + 1] = lookup[i] end
    MySQL.update.await(([[
        UPDATE users SET passlist = ?
        WHERE license IN (%s) OR license2 IN (%s)
    ]]):format(inList, inList), params)
    if not allowed then
        kickRemoved(user)
    end
    return true
end

---@param userId number|string
---@return boolean
local function setPasslist(userId, allowed)
    userId = tonumber(userId)
    if not userId then return false end
    local user = MySQL.single.await(
        'SELECT userId, license, license2, discord FROM users WHERE userId = ?',
        { userId }
    )
    if not user then return false end
    local value = allowed and 1 or 0
    MySQL.update.await('UPDATE users SET passlist = ? WHERE userId = ?', { value, userId })
    if not allowed then
        kickRemoved(user)
    end
    return true
end

--- Sem bypass de admin. Passlist fica em users.passlist.
---@return string|nil kickReason
local function waitForUser(src)
    local deadline = GetGameTimer() + (Config.WaitForUserMs or 8000)
    local user = fetchUser(src)
    while not user and GetGameTimer() < deadline do
        Wait(500)
        user = fetchUser(src)
    end
    return user
end

local function checkConnecting(src)
    local license = identifierOf(src, 'license2') or identifierOf(src, 'license')
    if not license then
        return Config.KickNoLicense:format(Config.DiscordInvite)
    end

    local user = waitForUser(src)
    if not user then
        print(('[sunville_passlist] %s sem linha em users. license=%s discord=%s'):format(
            GetPlayerName(src) or src,
            license,
            identifierOf(src, 'discord') or 'nil'
        ))
        return Config.KickNotListed:format(license, Config.DiscordInvite)
    end

    if isPasslisted(user.passlist) then
        print(('[sunville_passlist] %s liberado (userId %s)'):format(GetPlayerName(src) or src, user.userId))
        return nil
    end

    local shownLicense = identifierOf(src, 'license2') or user.license2 or user.license or license
    print(('[sunville_passlist] %s bloqueado. userId=%s license=%s'):format(
        GetPlayerName(src) or src,
        user.userId,
        shownLicense
    ))
    return Config.KickNotListed:format(shownLicense, Config.DiscordInvite)
end

AddEventHandler('playerConnecting', function(_, _, deferrals)
    local src = source
    deferrals.defer()
    Wait(0)
    deferrals.update('Verificando sua passlist...')

    local finished = false
    local function finish(reason)
        if finished then return end
        finished = true
        if reason then
            deferrals.done(reason)
        else
            deferrals.done()
        end
    end

    SetTimeout(Config.ConnectTimeoutMs or 20000, function()
        if not finished then
            print(('[sunville_passlist] Verificação de %s passou do tempo limite.'):format(GetPlayerName(src) or src))
        end
        finish(Config.KickError:format(Config.DiscordInvite))
    end)

    local ok, reason = pcall(checkConnecting, src)
    if not ok then
        print(('[sunville_passlist] Erro ao verificar %s: %s'):format(GetPlayerName(src) or src, tostring(reason)))
        finish(Config.KickError:format(Config.DiscordInvite))
        return
    end
    finish(reason)
end)

local function isListed(src)
    local user = fetchUser(src)
    return user ~= nil and isPasslisted(user.passlist), user
end

MySQL.ready(function()
    MySQL.query.await([[
        ALTER TABLE `users`
        ADD COLUMN IF NOT EXISTS `passlist` TINYINT(1) NOT NULL DEFAULT 0
    ]])

    local legacy = MySQL.scalar.await([[
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'players'
          AND COLUMN_NAME = 'passlist'
    ]])

    if tonumber(legacy) and tonumber(legacy) > 0 then
        MySQL.query.await([[
            UPDATE users u
            INNER JOIN players p ON p.userId = u.userId
            SET u.passlist = 1
            WHERE p.passlist = 1 AND u.passlist = 0
        ]])
    end

    MySQL.query([[
        CREATE TABLE IF NOT EXISTS passlist_applications (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            discord_id VARCHAR(32) NOT NULL,
            discord_tag VARCHAR(80) NULL,
            nome VARCHAR(100) NULL,
            idade VARCHAR(20) NULL,
            experiencia TEXT NULL,
            motivo TEXT NULL,
            historico TEXT NULL,
            status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
            staff_id VARCHAR(32) NULL,
            staff_tag VARCHAR(80) NULL,
            reason TEXT NULL,
            review_channel_id VARCHAR(32) NULL,
            review_message_id VARCHAR(32) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_discord_status (discord_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ]])

    print('[sunville_passlist] Coluna users.passlist pronta. Sem bypass de admin.')
end)

RegisterCommand('passlist', function(src, args)
    if src ~= 0 then
        print('[sunville_passlist] Use este comando no console do servidor (txAdmin).')
        return
    end

    local action = tostring(args[1] or ''):lower()
    local userId = args[2]

    if (action ~= 'add' and action ~= 'del' and action ~= 'remove') or not userId then
        print('Uso: passlist add <userId ou license>')
        print('     passlist del <userId ou license>')
        return
    end

    local ok
    if tonumber(userId) then
        ok = setPasslist(userId, action == 'add')
    else
        ok = setPasslistByLicense(userId, action == 'add')
    end
    if not ok then
        print(('[sunville_passlist] Não achei userId/license %s na tabela users.'):format(userId))
        return
    end

    if action == 'add' then
        print(('[sunville_passlist] userId %s liberado (users.passlist = 1).'):format(userId))
    else
        print(('[sunville_passlist] userId %s removido (users.passlist = 0).'):format(userId))
    end
end, true)

---Expulsa quem está online com esse userId, se a passlist dele estiver zerada.
---@return boolean kicked
local function kickIfRemoved(userId)
    userId = tonumber(userId)
    if not userId then return false end
    local user = MySQL.single.await(
        'SELECT userId, passlist, license, license2, discord FROM users WHERE userId = ?',
        { userId }
    )
    if not user or isPasslisted(user.passlist) then return false end
    kickRemoved(user)
    return true
end

exports('checkConnecting', checkConnecting)
exports('kickIfRemoved', kickIfRemoved)
exports('isListed', isListed)
exports('setPasslist', setPasslist)
exports('fetchUser', fetchUser)
