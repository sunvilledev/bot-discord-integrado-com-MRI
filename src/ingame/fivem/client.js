const { fivem } = require('../config');

const TIMEOUT_MS = 15000;

async function request(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(fivem.endpoint(path), {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${fivem.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const message = data?.error || data?.message || `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O servidor FiveM não respondeu a tempo. Confira IP, porta e se o resource sunville_bridge está iniciado.');
    }
    if (error.cause?.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
      throw new Error(
        `Não foi possível conectar no FiveM em ${fivem.baseUrl}. Use a porta do jogo (em geral 30120), não a do MySQL/txAdmin.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function publicGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${fivem.baseUrl}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getStatus() {
  try {
    const dynamic = await publicGet('/dynamic.json');
    return {
      hostname: dynamic.hostname || 'FiveM',
      players: dynamic.clients ?? 0,
      framework: 'FiveM',
    };
  } catch {
    return request('/status');
  }
}

async function getPlayers() {
  try {
    return await request('/players');
  } catch {
    const list = await publicGet('/players.json');
    if (!Array.isArray(list)) {
      throw new Error('Não foi possível listar os jogadores.');
    }
    return {
      players: list.map((player) => ({
        id: player.id,
        name: player.name || 'Desconhecido',
      })),
    };
  }
}

function spawnVehicle({ playerId, model, plate, warp }) {
  return request('/spawn', {
    method: 'POST',
    body: { playerId, model, plate, warp },
  });
}

async function executeCommand(action, fields) {
  try {
    return await request('/command', {
      method: 'POST',
      body: { action, fields },
    });
  } catch (error) {
    if (error.status === 404) {
      throw new Error(
        'O resource sunville_bridge no FiveM está desatualizado. Copie a pasta de novo e dê ensure sunville_bridge.',
      );
    }
    throw error;
  }
}

module.exports = {
  getStatus,
  getPlayers,
  spawnVehicle,
  executeCommand,
};
