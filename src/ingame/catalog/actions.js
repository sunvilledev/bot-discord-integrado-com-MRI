const ACTIONS = [
  { id: 'revive_player', label: 'Reviver jogador', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'freeze_player', label: 'Congelar / descongelar', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'drunk_player', label: 'Deixar jogador bêbado', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'remove_stress', label: 'Remover estresse', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'clothing_menu', label: 'Menu de roupas', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'set_ped', label: 'Definir ped', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'ped', label: 'Modelo do ped', required: true, placeholder: 'a_m_m_business_01' },
  ] },
  { id: 'kick_player', label: 'Expulsar jogador', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'reason', label: 'Motivo', required: false, placeholder: 'Motivo do kick' },
  ] },
  { id: 'warn_player', label: 'Alertar jogador', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'reason', label: 'Motivo', required: true },
  ] },
  { id: 'ban_player', label: 'Banir jogador', category: 'player', proof: true, fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'reason', label: 'Motivo', required: true, style: 'paragraph', maxLength: 400 },
    { id: 'duration', label: 'Duração em dias', required: true, placeholder: '7 = 7 dias / 9999 = permanente' },
    { id: 'proofs', label: 'Provas (links)', required: false, style: 'paragraph', maxLength: 400, placeholder: 'Link de foto, vídeo ou clip' },
  ] },
  { id: 'unban_player', label: 'Desbanir jogador', category: 'player', proof: true, fields: [
    { id: 'identifier', label: 'Discord, license ou Citizen ID', required: true, placeholder: '1394... / license2:xxxx / RL22Y9SC' },
    { id: 'reason', label: 'Motivo', required: true, style: 'paragraph', maxLength: 400 },
    { id: 'proofs', label: 'Provas (links)', required: false, style: 'paragraph', maxLength: 400, placeholder: 'Link de foto, vídeo ou clip' },
  ] },
  { id: 'advertencia_player', label: 'Dar advertência', category: 'player', proof: true, fields: [
    { id: 'identifier', label: 'Citizen ID ou Discord', required: true, placeholder: 'RL22Y9SC ou 1394...' },
    { id: 'reason', label: 'Motivo', required: true, style: 'paragraph', maxLength: 400 },
    { id: 'proofs', label: 'Provas (links)', required: false, style: 'paragraph', maxLength: 400, placeholder: 'Link de foto, vídeo ou clip' },
  ] },
  { id: 'remove_advertencia', label: 'Tirar advertência', category: 'player', proof: true, fields: [
    { id: 'identifier', label: 'Citizen ID ou Discord', required: true, placeholder: 'RL22Y9SC ou 1394...' },
    { id: 'reason', label: 'Motivo', required: true, style: 'paragraph', maxLength: 400 },
    { id: 'proofs', label: 'Provas (links)', required: false, style: 'paragraph', maxLength: 400, placeholder: 'Link de foto, vídeo ou clip' },
  ] },
  { id: 'view_player_info', label: 'Ver informações do jogador', category: 'player', fields: [
    { id: 'playerId', label: 'ID, CitizenID ou Discord', required: true, placeholder: '12 / RL22Y9SC / 1394...' },
  ] },
  { id: 'view_inventory', label: 'Ver inventário do jogador', category: 'player', fields: [
    { id: 'playerId', label: 'ID, CitizenID ou Discord', required: true, placeholder: '12 / RL22Y9SC / 1394...' },
  ] },
  { id: 'mute_player', label: 'Silenciar jogador', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'toggle_cuffs', label: 'Algemar / desalgemar', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'bring_player', label: 'Puxar jogador até outro', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'targetId', label: 'ID de destino', required: true, placeholder: 'Para quem ele vai' },
  ] },
  { id: 'teleport_to_player', label: 'Teleportar até jogador', category: 'player', fields: [
    { id: 'playerId', label: 'ID de quem teleporta', required: true },
    { id: 'targetId', label: 'ID do destino', required: true },
  ] },
  { id: 'play_sound', label: 'Tocar som', category: 'player', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'sound', label: 'Som', required: true, placeholder: 'alert / cuff / airwrench' },
  ] },

  { id: 'give_money', label: 'Dar dinheiro', category: 'economy', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'amount', label: 'Valor', required: true },
    { id: 'moneyType', label: 'Tipo', required: true, placeholder: 'cash / bank / crypto' },
  ] },
  { id: 'remove_money', label: 'Remover dinheiro', category: 'economy', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'amount', label: 'Valor', required: true },
    { id: 'moneyType', label: 'Tipo', required: true, placeholder: 'cash / bank' },
  ] },
  { id: 'give_item', label: 'Dar item', category: 'economy', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'item', label: 'Item', required: true, placeholder: 'water_bottle' },
    { id: 'amount', label: 'Quantidade', required: true, placeholder: '1' },
  ] },
  { id: 'give_item_all', label: 'Dar item para todos', category: 'economy', fields: [
    { id: 'item', label: 'Item', required: true },
    { id: 'amount', label: 'Quantidade', required: true, placeholder: '1' },
  ] },
  { id: 'give_money_all', label: 'Dar dinheiro para todos', category: 'economy', fields: [
    { id: 'amount', label: 'Valor', required: true },
    { id: 'moneyType', label: 'Tipo', required: true, placeholder: 'cash / bank / crypto' },
  ] },
  { id: 'clear_inventory', label: 'Limpar inventário', category: 'economy', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'clear_inventory_offline', label: 'Limpar inventário offline', category: 'economy', fields: [
    { id: 'citizenId', label: 'Citizen ID', required: true },
  ] },
  { id: 'set_job', label: 'Definir emprego', category: 'economy', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'job', label: 'Emprego', required: true, placeholder: 'police' },
    { id: 'grade', label: 'Cargo (grade)', required: true, placeholder: '0' },
  ] },
  { id: 'fire_job', label: 'Demitir do emprego', category: 'economy', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'set_gang', label: 'Definir gangue', category: 'economy', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'gang', label: 'Gangue', required: true, placeholder: 'lostmc' },
    { id: 'grade', label: 'Cargo (grade)', required: true, placeholder: '0' },
  ] },
  { id: 'fire_gang', label: 'Demitir da gangue', category: 'economy', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },

  { id: 'spawn_vehicle', label: 'Spawnar veículo', category: 'vehicle', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'model', label: 'Modelo', required: true, placeholder: 'sultan' },
    { id: 'plate', label: 'Placa (opcional)', required: false },
    { id: 'warp', label: 'Colocar no veículo?', required: false, placeholder: 'sim' },
  ] },
  { id: 'give_vehicle', label: 'Adicionar veículo na garagem', category: 'vehicle', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'model', label: 'Modelo', required: true, placeholder: 'sultan' },
    { id: 'plate', label: 'Placa (opcional)', required: false },
    { id: 'garage', label: 'Garagem (opcional)', required: false, placeholder: 'pillboxgarage' },
  ] },
  { id: 'fix_vehicle_for', label: 'Consertar veículo do jogador', category: 'vehicle', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'fix_vehicle', label: 'Consertar veículo (no jogador)', category: 'vehicle', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'refuel_vehicle', label: 'Reabastecer veículo', category: 'vehicle', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'delete_vehicle', label: 'Deletar veículo próximo', category: 'vehicle', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'max_mods', label: 'Maximizar mods', category: 'vehicle', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
  ] },
  { id: 'change_plate', label: 'Alterar placa', category: 'vehicle', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'plate', label: 'Nova placa', required: true },
  ] },

  { id: 'revive_all', label: 'Reviver todos', category: 'world', fields: [] },
  { id: 'change_weather', label: 'Alterar clima', category: 'world', fields: [
    { id: 'weather', label: 'Clima', required: true, placeholder: 'Extrasunny, Clear, Rain, Xmas...' },
  ] },
  { id: 'change_time', label: 'Alterar horário', category: 'world', fields: [
    { id: 'hour', label: 'Hora (0-23)', required: true, placeholder: '12' },
  ] },
  { id: 'blackout', label: 'Queda de energia (on/off)', category: 'world', fields: [] },
  { id: 'teleport_to_coords', label: 'Teleportar para coordenadas', category: 'world', fields: [
    { id: 'playerId', label: 'ID do jogador', required: true },
    { id: 'coords', label: 'Coordenadas', required: true, placeholder: 'x, y, z' },
  ] },
];

const CATEGORIES = [
  { id: 'player', label: 'Jogador', description: 'Revive, kick, freeze, puxar...' },
  { id: 'economy', label: 'Economia e grupos', description: 'Dinheiro, itens, emprego, gangue' },
  { id: 'vehicle', label: 'Veículos', description: 'Spawn, conserto, placa, combustível' },
  { id: 'world', label: 'Servidor', description: 'Clima, hora, revive all, blackout' },
];

function getAction(id) {
  return ACTIONS.find((action) => action.id === id);
}

function getActionsByCategory(categoryId) {
  return ACTIONS.filter((action) => action.category === categoryId);
}

module.exports = {
  ACTIONS,
  CATEGORIES,
  getAction,
  getActionsByCategory,
};
