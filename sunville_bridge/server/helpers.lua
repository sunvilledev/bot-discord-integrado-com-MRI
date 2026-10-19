function BridgeGetFramework()
    if GetResourceState('qbx_core') == 'started' then
        return 'qbx'
    end
    if GetResourceState('qb-core') == 'started' then
        return 'qb'
    end
    return nil
end

function BridgeGetPlayer(id)
    id = tonumber(id)
    if not id then
        return nil
    end
    if GetResourceState('qbx_core') == 'started' then
        return exports.qbx_core:GetPlayer(id)
    end
    if GetResourceState('qb-core') == 'started' then
        local QBCore = exports['qb-core']:GetCoreObject()
        return QBCore.Functions.GetPlayer(id)
    end
    return nil
end

function BridgeRequireOnline(id)
    id = tonumber(id)
    if not id or not GetPlayerName(id) then
        return nil, 'Jogador não está online.'
    end
    return id
end

function BridgeNotify(src, message, nType, duration)
    if not src or src == 0 then
        return
    end
    duration = tonumber(duration) or 5000
    if GetResourceState('ox_lib') == 'started' then
        TriggerClientEvent('ox_lib:notify', src, {
            title = duration >= 60000 and 'Advertência' or nil,
            description = message,
            type = nType or 'inform',
            duration = duration,
            showDuration = duration >= 15000,
        })
        return
    end
    if GetResourceState('qbx_core') == 'started' then
        pcall(function()
            exports.qbx_core:Notify(src, message, nType or 'inform', duration)
        end)
        return
    end
    TriggerClientEvent('QBCore:Notify', src, message, nType or 'primary', duration)
end

function BridgeRevive(playerId)
    if GetResourceState('ars_ambulancejob') == 'started' then
        TriggerClientEvent('ars_ambulancejob:healPlayer', playerId, { revive = true })
        return
    end
    if GetResourceState('qbx_medical') == 'started' then
        TriggerClientEvent('qbx_medical:client:playerRevived', playerId)
    end
    TriggerClientEvent('hospital:client:Revive', playerId)
end

-- O mri_Qweather registra a API antiga do qb-weathersync com esse nome.
function BridgeWeatherApi()
    if GetResourceState('mri_Qweather') ~= 'started' and GetResourceState('qb-weathersync') ~= 'started' then
        return nil, 'Nenhum resource de clima (mri_Qweather) está iniciado.'
    end
    return exports['qb-weathersync']
end

function BridgeAddItem(playerId, item, amount)
    amount = tonumber(amount) or 1
    if GetResourceState('ox_inventory') == 'started' then
        return exports.ox_inventory:AddItem(playerId, item, amount)
    end
    local player = BridgeGetPlayer(playerId)
    if player then
        player.Functions.AddItem(item, amount)
        return true
    end
    return false
end
