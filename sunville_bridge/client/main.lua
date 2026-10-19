RegisterNetEvent('sunville_bridge:client:enterVehicle', function(netId)
    if not netId then
        return
    end

    local timeout = GetGameTimer() + 5000
    while not NetworkDoesNetworkIdExist(netId) and GetGameTimer() < timeout do
        Wait(50)
    end

    local vehicle = NetToVeh(netId)
    if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then
        return
    end

    TaskWarpPedIntoVehicle(PlayerPedId(), vehicle, -1)

    local seated = GetGameTimer() + 3000
    while GetGameTimer() < seated and not IsPedInVehicle(PlayerPedId(), vehicle, false) do
        Wait(50)
    end

    pcall(function()
        Entity(vehicle).state:set('keysIn', true, true)
    end)
    SetVehicleDoorsLocked(vehicle, 1)
    SetVehicleEngineOn(vehicle, true, true, false)
end)

local function forceDeleteVehicle(vehicle)
    if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then
        return false
    end

    local timeout = GetGameTimer() + 2000
    NetworkRequestControlOfEntity(vehicle)
    while not NetworkHasControlOfEntity(vehicle) and GetGameTimer() < timeout do
        NetworkRequestControlOfEntity(vehicle)
        Wait(0)
    end

    SetEntityAsMissionEntity(vehicle, true, true)
    SetVehicleHasBeenOwnedByPlayer(vehicle, false)
    DeleteVehicle(vehicle)
    if DoesEntityExist(vehicle) then
        DeleteEntity(vehicle)
    end

    return not DoesEntityExist(vehicle)
end

local function getClosestVehicle(coords, radius)
    local closest, closestDist
    for _, veh in ipairs(GetGamePool('CVehicle')) do
        local dist = #(GetEntityCoords(veh) - coords)
        if dist <= radius and (not closestDist or dist < closestDist) then
            closest = veh
            closestDist = dist
        end
    end
    return closest
end

RegisterNetEvent('sunville_bridge:client:refuel', function()
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle == 0 then return end
    if GetResourceState('cdn-fuel') == 'started' then
        pcall(function()
            exports['cdn-fuel']:SetFuel(vehicle, 100.0)
        end)
    end
    pcall(function()
        Entity(vehicle).state:set('fuel', 100.0, true)
    end)
    SetVehicleFuelLevel(vehicle, 100.0)
end)

RegisterNetEvent('sunville_bridge:client:maxMods', function()
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle == 0 then return end
    SetVehicleModKit(vehicle, 0)
    ToggleVehicleMod(vehicle, 18, true)
    SetVehicleFixed(vehicle)
    -- motor, freio, transmissão, suspensão e blindagem
    for _, modType in ipairs({ 11, 12, 13, 15, 16 }) do
        local maxMod = GetNumVehicleMods(vehicle, modType) - 1
        if maxMod >= 0 then
            SetVehicleMod(vehicle, modType, maxMod, false)
        end
    end
end)

RegisterNetEvent('sunville_bridge:client:deleteNearbyVehicle', function(radius, netId)
    radius = tonumber(radius) or 8.0
    local vehicle = 0

    if netId and NetworkDoesNetworkIdExist(netId) then
        vehicle = NetToVeh(netId)
    end

    if vehicle == 0 or not DoesEntityExist(vehicle) then
        local ped = PlayerPedId()
        vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle == 0 then
            vehicle = getClosestVehicle(GetEntityCoords(ped), radius) or 0
        end
    end

    local ok = forceDeleteVehicle(vehicle)
    TriggerServerEvent('sunville_bridge:server:deleteNearbyResult', ok)
end)
