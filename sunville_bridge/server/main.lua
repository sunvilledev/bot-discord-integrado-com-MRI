local function getToken()
    if Config.Token and Config.Token ~= '' then
        return Config.Token
    end
    return GetConvar('sunville_bridge_token', '')
end

local function sendJson(res, status, payload)
    res.writeHead(status, { ['Content-Type'] = 'application/json' })
    res.send(json.encode(payload))
end

local function decodeJson(body)
    if not body or body == '' then
        return {}
    end
    local ok, data = pcall(json.decode, body)
    if ok and type(data) == 'table' then
        return data
    end
    return {}
end

local function getHeader(req, name)
    local headers = req.headers or {}
    local want = name:lower()
    for key, value in pairs(headers) do
        if tostring(key):lower() == want then
            return value
        end
    end
    return nil
end

local function isAuthorized(req)
    local token = getToken()
    if token == '' then
        return false
    end

    local header = getHeader(req, 'authorization') or ''
    local bearer = header:match('^[Bb]earer%s+(.+)$')
    return bearer == token or getHeader(req, 'x-bridge-token') == token
end

local function normalizePath(path)
    path = tostring(path or '/'):lower()
    path = path:gsub('%?.*', '')
    path = path:gsub('/+$', '')
    local resourceName = GetCurrentResourceName():lower()
    local prefix = '/' .. resourceName
    if path == prefix then
        return '/'
    end
    if path:sub(1, #prefix + 1) == prefix .. '/' then
        path = path:sub(#prefix + 1)
    end
    if path == '' then
        path = '/'
    end
    if path:sub(1, 1) ~= '/' then
        path = '/' .. path
    end
    return path
end

local function getFramework()
    if GetResourceState('qbx_core') == 'started' then
        return 'qbx_core (MRI Qbox)'
    end
    if GetResourceState('qb-core') == 'started' then
        return 'qb-core'
    end
    return 'desconhecido'
end

local function getPlayerObject(id)
    if GetResourceState('qbx_core') == 'started' then
        return exports.qbx_core:GetPlayer(id)
    end
    if GetResourceState('qb-core') == 'started' then
        local QBCore = exports['qb-core']:GetCoreObject()
        return QBCore.Functions.GetPlayer(id)
    end
    return nil
end

local function getPlayerInfo(id)
    local player = getPlayerObject(id)
    if player and player.PlayerData then
        local info = player.PlayerData.charinfo or {}
        local fullName = ((info.firstname or '') .. ' ' .. (info.lastname or '')):gsub('^%s+', ''):gsub('%s+$', '')
        return {
            id = id,
            name = fullName ~= '' and fullName or GetPlayerName(id),
            citizenid = player.PlayerData.citizenid,
        }
    end

    return {
        id = id,
        name = GetPlayerName(id) or ('ID ' .. tostring(id)),
    }
end

local function listPlayers()
    local players = {}
    for _, id in ipairs(GetPlayers()) do
        players[#players + 1] = getPlayerInfo(tonumber(id))
    end
    table.sort(players, function(a, b)
        return a.id < b.id
    end)
    return players
end

local function notify(src, message, nType)
    if GetResourceState('ox_lib') == 'started' then
        TriggerClientEvent('ox_lib:notify', src, {
            description = message,
            type = nType or 'success',
        })
        return
    end
    if GetResourceState('qbx_core') == 'started' then
        pcall(function()
            exports.qbx_core:Notify(src, message, nType or 'success')
        end)
        return
    end
    TriggerClientEvent('QBCore:Notify', src, message, nType or 'success')
end

local function normalizePlate(plate)
    if not plate then
        return ''
    end
    return (tostring(plate):gsub('%W', '')):upper()
end

local function waitForPlate(vehicle, expected, ms)
    local timeout = GetGameTimer() + (ms or 4000)
    local last = ''

    while GetGameTimer() < timeout do
        local text = GetVehicleNumberPlateText(vehicle) or ''
        last = text
        local clean = normalizePlate(text)
        if clean ~= '' then
            if not expected or clean == normalizePlate(expected) then
                return text, clean
            end
        end
        Wait(50)
    end

    return last, normalizePlate(last)
end

local function giveKeys(src, vehicle, plate)
    if not plate or normalizePlate(plate) == '' then
        print('[sunville_bridge] Placa vazia ao entregar chave; chave não foi gerada.')
        return
    end

    -- Só um sistema: na MRI, chamar os outros também gera chave extra.
    if GetResourceState('mri_Qcarkeys') == 'started' then
        pcall(function()
            exports.mri_Qcarkeys:GiveTempKeys(src, plate)
        end)
        return
    end

    if GetResourceState('qbx_vehiclekeys') == 'started' then
        pcall(function()
            exports.qbx_vehiclekeys:GiveKeys(src, vehicle)
        end)
        return
    end

    if GetResourceState('qb-vehiclekeys') == 'started' then
        TriggerClientEvent('qb-vehiclekeys:client:AddKeys', src, plate)
        return
    end

    if GetResourceState('mm_carkeys') == 'started' then
        TriggerClientEvent('mm_carkeys:client:addtempkeys', src, plate)
        return
    end

    TriggerClientEvent('vehiclekeys:client:SetOwner', src, plate)
end

local function waitForEntity(entity, ms)
    local timeout = GetGameTimer() + (ms or 5000)
    while not DoesEntityExist(entity) and GetGameTimer() < timeout do
        Wait(10)
    end
    return DoesEntityExist(entity)
end

local function resolveVehicleType(hash)
    if GetResourceState('qbx_core') == 'started' then
        local ok, info = pcall(function()
            return exports.qbx_core:GetVehiclesByHash(hash)
        end)
        if ok and type(info) == 'table' and info.type then
            return info.type
        end
    end

    local temp = CreateVehicle(hash, 0.0, 0.0, -200.0, 0.0, true, true)
    if not waitForEntity(temp, 3000) then
        return nil
    end

    local vehicleType = GetVehicleType(temp)
    DeleteEntity(temp)
    return vehicleType
end

function spawnForPlayer(playerId, model, plate, warp)
    local ped = GetPlayerPed(playerId)
    if not ped or ped == 0 then
        return nil, 'Ped do jogador não encontrado.'
    end

    local hash = joaat(model)
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local vehicleType = resolveVehicleType(hash)

    if not vehicleType then
        return nil, ('Modelo "%s" não foi reconhecido pelo servidor.'):format(model)
    end

    local vehicle = CreateVehicleServerSetter(hash, vehicleType, coords.x, coords.y, coords.z, heading)
    if not waitForEntity(vehicle, 5000) then
        return nil, 'Não foi possível criar o veículo. Confira se o modelo existe.'
    end

    local bucket = GetPlayerRoutingBucket(playerId)
    if bucket and bucket > 0 then
        SetEntityRoutingBucket(vehicle, bucket)
    end

    pcall(function()
        SetEntityOrphanMode(vehicle, 2)
    end)

    SetVehicleDoorsLocked(vehicle, 1)

    if plate and plate ~= '' then
        SetVehicleNumberPlateText(vehicle, plate)
    end

    local usedPlate, cleanPlate = waitForPlate(vehicle, plate ~= '' and plate or nil, 4000)
    if not cleanPlate or cleanPlate == '' then
        DeleteEntity(vehicle)
        return nil, 'A placa do veículo não ficou pronta. Tente spawnar de novo.'
    end

    pcall(function()
        Entity(vehicle).state:set('keysIn', true, true)
    end)

    local netId = NetworkGetNetworkIdFromEntity(vehicle)
    if warp then
        pcall(SetPedIntoVehicle, ped, vehicle, -1)
        TriggerClientEvent('sunville_bridge:client:enterVehicle', playerId, netId)
        local seated = GetGameTimer() + 4000
        while GetGameTimer() < seated and GetVehiclePedIsIn(ped, false) ~= vehicle do
            Wait(50)
        end
    end

    -- A MRI compara a placa sem espaços/símbolos; só entrega depois que ela existe
    -- e o jogador já está no veículo, para o cliente ligar o motor.
    giveKeys(playerId, vehicle, usedPlate)
    notify(playerId, ('Um %s foi spawnado para você. Placa %s.'):format(model, cleanPlate), 'success')

    return {
        plate = cleanPlate,
        netId = netId,
    }
end

local function handleStatus(res)
    sendJson(res, 200, {
        ok = true,
        hostname = GetConvar('sv_hostname', 'FiveM'),
        players = #GetPlayers(),
        framework = getFramework(),
        resource = GetCurrentResourceName(),
    })
end

local function handlePlayers(res)
    sendJson(res, 200, {
        ok = true,
        players = listPlayers(),
    })
end

local function handleSpawn(res, body)
    local data = decodeJson(body)
    local playerId = tonumber(data.playerId or data.id)
    local model = tostring(data.model or ''):lower():gsub('%s+', '')
    local plate = tostring(data.plate or ''):upper():gsub('%s+', '')
    local warp = data.warp ~= false

    if not playerId or playerId < 1 then
        sendJson(res, 400, { ok = false, error = 'ID do jogador inválido.' })
        return
    end

    if model == '' or not model:match('^[%w_]+$') then
        sendJson(res, 400, { ok = false, error = 'Modelo do veículo inválido.' })
        return
    end

    if not GetPlayerName(playerId) then
        sendJson(res, 404, { ok = false, error = ('Jogador %s não está online.'):format(playerId) })
        return
    end

    local vehicle, err = spawnForPlayer(playerId, model, plate, warp)
    if not vehicle then
        sendJson(res, 422, { ok = false, error = err })
        return
    end

    local player = getPlayerInfo(playerId)
    print(('[sunville_bridge] Spawn %s para %s (ID %s) placa %s'):format(
        model,
        player.name,
        playerId,
        vehicle.plate or '-'
    ))

    sendJson(res, 200, {
        ok = true,
        player = player,
        vehicle = vehicle,
    })
end

local executeCommandFn

local function loadLuaFile(relativePath)
    local source = LoadResourceFile(GetCurrentResourceName(), relativePath)
    if not source or source == '' then
        return nil, ('Arquivo %s não encontrado no resource.'):format(relativePath)
    end

    local chunk, err = load(source, ('@%s/%s'):format(GetCurrentResourceName(), relativePath))
    if not chunk then
        return nil, err
    end

    local ok, runtimeErr = pcall(chunk)
    if not ok then
        return nil, runtimeErr
    end

    return true
end

local function ensureCommands()
    if type(executeCommandFn) == 'function' then
        return executeCommandFn
    end

    if type(BridgeRequireOnline) ~= 'function' then
        local ok, err = loadLuaFile('server/helpers.lua')
        if not ok then
            return nil, err
        end
    end

    if type(ExecuteBridgeCommand) ~= 'function' then
        local ok, err = loadLuaFile('server/commands.lua')
        if not ok then
            return nil, err
        end
    end

    executeCommandFn = ExecuteBridgeCommand
    if type(executeCommandFn) ~= 'function' then
        return nil, 'ExecuteBridgeCommand não foi definido após carregar commands.lua.'
    end

    return executeCommandFn
end

local function handleCommand(res, body)
    local data = decodeJson(body)
    local action = tostring(data.action or '')
    local fields = type(data.fields) == 'table' and data.fields or {}

    if action == '' then
        sendJson(res, 400, { ok = false, error = 'Ação não informada.' })
        return
    end

    local execute, loadErr = ensureCommands()
    if not execute then
        sendJson(res, 500, { ok = false, error = tostring(loadErr) })
        return
    end

    local result, err = execute(action, fields)
    if not result then
        sendJson(res, 422, { ok = false, error = err or 'Falha ao executar o comando.' })
        return
    end

    print(('[sunville_bridge] Comando %s: %s'):format(action, result.message or 'ok'))
    sendJson(res, 200, { ok = true, action = action, result = result })
end

SetHttpHandler(function(req, res)
    if not isAuthorized(req) then
        sendJson(res, 401, { ok = false, error = 'Token inválido. Confira FIVEM_TOKEN e sunville_bridge_token.' })
        return
    end

    local path = normalizePath(req.path)
    local method = (req.method or 'GET'):upper()

    if method == 'GET' and (path == '/' or path == '/status') then
        handleStatus(res)
        return
    end

    if method == 'GET' and path == '/players' then
        handlePlayers(res)
        return
    end

    if method == 'POST' and path == '/spawn' then
        req.setDataHandler(function(body)
            CreateThread(function()
                local ok, err = pcall(handleSpawn, res, body)
                if not ok then
                    print(('[sunville_bridge] Erro no spawn: %s'):format(err))
                    sendJson(res, 500, {
                        ok = false,
                        error = ('Falha ao spawnar: %s'):format(tostring(err)),
                    })
                end
            end)
        end)
        return
    end

    if method == 'POST' and path == '/command' then
        req.setDataHandler(function(body)
            CreateThread(function()
                local ok, err = pcall(handleCommand, res, body)
                if not ok then
                    print(('[sunville_bridge] Erro no comando: %s'):format(err))
                    sendJson(res, 500, {
                        ok = false,
                        error = ('Falha ao executar: %s'):format(tostring(err)),
                    })
                end
            end)
        end)
        return
    end

    sendJson(res, 404, { ok = false, error = 'Rota não encontrada.' })
end)

CreateThread(function()
    if getToken() == '' then
        print('^1[sunville_bridge] Token vazio. Defina Config.Token ou a convar sunville_bridge_token.^0')
    else
        print('^2[sunville_bridge] Ponte Discord pronta.^0')
    end
end)
