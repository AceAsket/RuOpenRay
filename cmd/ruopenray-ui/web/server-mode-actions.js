export function createServerModeActions({ state, request, render }) {
  function syncServerMode(result) {
    if (!result || typeof result !== 'object') return;
    state.serverMode = result;
    if (result.config) {
      state.serverModeDraft = JSON.parse(JSON.stringify(result.config));
    }
    if (result.preflight) state.serverModePreflight = result.preflight;
  }

  async function refreshServerMode({ silent = false } = {}) {
    if (!silent) {
      state.busyAction = 'refreshServerMode';
      render();
    }
    try {
      const result = await request('/api/server-mode');
      syncServerMode(result);
      if (!silent) state.message = 'Серверный режим обновлен';
      return result;
    } finally {
      if (!silent && state.busyAction === 'refreshServerMode') {
        state.busyAction = '';
        render();
      }
    }
  }

  function ensureDraft() {
    if (!state.serverModeDraft) {
      state.serverModeDraft = JSON.parse(JSON.stringify(state.serverMode?.config || { version: 1, enabled: false, monitorClients: true, xray: [], awg: [] }));
    }
    if (typeof state.serverModeDraft.monitorClients !== 'boolean') state.serverModeDraft.monitorClients = true;
    state.serverModeDraft.xray = Array.isArray(state.serverModeDraft.xray) ? state.serverModeDraft.xray : [];
    state.serverModeDraft.awg = Array.isArray(state.serverModeDraft.awg) ? state.serverModeDraft.awg : [];
    return state.serverModeDraft;
  }

  function resetServerModePreviews() {
    state.serverModePreview = null;
    state.serverModeFirewallPreview = null;
  }

  function setServerModeEnabled(enabled) {
    ensureDraft().enabled = Boolean(enabled);
    resetServerModePreviews();
    render();
  }

  async function addServerModeXrayInbound() {
    const draft = ensureDraft();
    const id = `public-${Date.now().toString(36)}`;
    const client = await request('/api/server-mode/client', {
      method: 'POST',
      body: JSON.stringify({ inboundId: id, name: 'Личный клиент', egressTag: 'direct' })
    });
    draft.enabled = true;
    draft.xray.push({
      id,
      name: 'Вход Reality',
      enabled: true,
      listen: '0.0.0.0',
      port: 443,
      protocol: 'vless',
      network: 'tcp',
      security: 'reality',
      reality: {
        dest: 'www.microsoft.com:443',
        serverNames: ['www.microsoft.com'],
        privateKey: '',
        shortIds: ['']
      },
      clients: [client.client],
      sniffing: true,
      openFirewall: false
    });
    resetServerModePreviews();
    render();
  }

  async function addServerModeClient(button) {
    const index = Number(button?.dataset?.serverModeInbound || 0);
    const draft = ensureDraft();
    const inbound = draft.xray[index];
    if (!inbound) return;
    const result = await request('/api/server-mode/client', {
      method: 'POST',
      body: JSON.stringify({ inboundId: inbound.id || `xray-${index + 1}`, name: 'Новый клиент', egressTag: 'direct' })
    });
    inbound.clients = Array.isArray(inbound.clients) ? inbound.clients : [];
    inbound.clients.push(result.client);
    resetServerModePreviews();
    render();
  }

  function addServerModeAWGServer() {
    const draft = ensureDraft();
    const id = `awg-${Date.now().toString(36)}`;
    draft.enabled = true;
    draft.awg.push({
      id,
      name: 'Вход AmneziaWG',
      enabled: false,
      interface: 'awg-server0',
      listenPort: 51820,
      addressCidr: '10.70.0.1/24',
      privateKey: '',
      publicKey: '',
      mtu: 1420,
      egressTag: 'direct',
      allowLan: false,
      openFirewall: false,
      peers: []
    });
    resetServerModePreviews();
    render();
  }

  function addServerModeAWGPeer(button) {
    const index = Number(button?.dataset?.serverModeAwg || 0);
    const draft = ensureDraft();
    const server = draft.awg[index];
    if (!server) return;
    server.peers = Array.isArray(server.peers) ? server.peers : [];
    server.peers.push({
      id: `peer-${Date.now().toString(36)}`,
      name: 'Новый peer',
      publicKey: '',
      allowedIps: `10.70.0.${server.peers.length + 2}/32`,
      presharedKey: '',
      enabled: true
    });
    resetServerModePreviews();
    render();
  }

  async function generateServerModeRealityKey(button) {
    const index = Number(button?.dataset?.serverModeInbound || 0);
    const draft = ensureDraft();
    const inbound = draft.xray[index];
    if (!inbound) return;
    const result = await request('/api/server-mode/reality-key', { method: 'POST' });
    if (!result?.ok || !result.privateKey) throw new Error(result?.error || result?.stderr || 'Не удалось сгенерировать ключ Reality');
    inbound.reality = inbound.reality || {};
    inbound.reality.privateKey = result.privateKey;
    state.message = result.publicKey ? `Reality publicKey: ${result.publicKey}` : 'Reality privateKey обновлен';
    resetServerModePreviews();
    render();
  }

  async function saveServerMode() {
    const result = await request('/api/server-mode', {
      method: 'POST',
      body: JSON.stringify({ config: ensureDraft() })
    });
    syncServerMode(result);
    state.message = result?.ok === false ? (result.error || 'Серверный режим не сохранен') : 'Серверный режим сохранен';
    render();
  }

  async function previewServerMode() {
    const result = await request('/api/server-mode/preview', {
      method: 'POST',
      body: JSON.stringify({ config: ensureDraft() })
    });
    state.serverModePreview = result;
    state.serverModePreflight = result.preflight || null;
    state.message = result.ok ? 'Preview server-mode прошел проверку' : 'Preview server-mode требует внимания';
    render();
  }

  async function previewServerModeFirewall() {
    const result = await request('/api/server-mode/firewall/preview', {
      method: 'POST',
      body: JSON.stringify({ config: ensureDraft() })
    });
    state.serverModeFirewallPreview = result;
    state.message = result.ok ? 'WAN firewall готов к применению' : (result.error || 'WAN firewall требует внимания');
    render();
  }

  async function applyServerModeFirewall() {
    const result = await request('/api/server-mode/firewall/apply', {
      method: 'POST',
      body: JSON.stringify({ config: ensureDraft(), confirm: true })
    });
    state.serverModeFirewallPreview = result;
    if (state.serverMode && result.status) state.serverMode.firewall = result.status;
    state.message = result.ok ? 'WAN-порты server-mode открыты' : (result.error || 'WAN firewall не применен');
    render();
  }

  async function disableServerModeFirewall() {
    const result = await request('/api/server-mode/firewall/disable', { method: 'POST' });
    state.serverModeFirewallPreview = result;
    if (state.serverMode && result.status) state.serverMode.firewall = result.status;
    state.message = result.ok ? 'WAN-порты server-mode закрыты' : (result.error || 'WAN firewall не отключен');
    render();
  }

  async function applyServerMode() {
    const result = await request('/api/server-mode/apply', {
      method: 'POST',
      body: JSON.stringify({ config: ensureDraft(), restart: false })
    });
    state.serverModePreview = result;
    if (result.config) state.serverModeDraft = JSON.parse(JSON.stringify(result.config));
    if (result.preflight) state.serverModePreflight = result.preflight;
    state.message = result.ok
      ? 'Server-mode записан в Xray config. Xray не перезапускался.'
      : (result.error || 'Server-mode не применен');
    render();
  }

  function deleteServerModeInbound(button) {
    const index = Number(button?.dataset?.serverModeInbound || 0);
    const draft = ensureDraft();
    draft.xray.splice(index, 1);
    resetServerModePreviews();
    render();
  }

  function deleteServerModeClient(button) {
    const inboundIndex = Number(button?.dataset?.serverModeInbound || 0);
    const clientIndex = Number(button?.dataset?.serverModeClient || 0);
    const draft = ensureDraft();
    const inbound = draft.xray[inboundIndex];
    if (!inbound || !Array.isArray(inbound.clients)) return;
    inbound.clients.splice(clientIndex, 1);
    resetServerModePreviews();
    render();
  }

  function deleteServerModeAWGServer(button) {
    const index = Number(button?.dataset?.serverModeAwg || 0);
    const draft = ensureDraft();
    draft.awg.splice(index, 1);
    resetServerModePreviews();
    render();
  }

  function deleteServerModeAWGPeer(button) {
    const serverIndex = Number(button?.dataset?.serverModeAwg || 0);
    const peerIndex = Number(button?.dataset?.serverModePeer || 0);
    const draft = ensureDraft();
    const server = draft.awg[serverIndex];
    if (!server || !Array.isArray(server.peers)) return;
    server.peers.splice(peerIndex, 1);
    resetServerModePreviews();
    render();
  }

  function updateServerModeField(input) {
    const draft = ensureDraft();
    const path = String(input?.dataset?.serverModeField || '').split('.').filter(Boolean);
    if (!path.length) return;
    let target = draft;
    for (let i = 0; i < path.length - 1; i += 1) {
      const part = path[i];
      target = Array.isArray(target) ? target[Number(part)] : target?.[part];
      if (!target) return;
    }
    const key = path[path.length - 1];
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (input.dataset.serverModeNumber === '1') value = Number(value || 0);
    if (input.dataset.serverModeList === '1') {
      value = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
    }
    target[key] = value;
    resetServerModePreviews();
  }

  return {
    refreshServerMode,
    syncServerMode,
    setServerModeEnabled,
    addServerModeXrayInbound,
    addServerModeClient,
    addServerModeAWGServer,
    addServerModeAWGPeer,
    generateServerModeRealityKey,
    saveServerMode,
    previewServerMode,
    previewServerModeFirewall,
    applyServerModeFirewall,
    disableServerModeFirewall,
    applyServerMode,
    deleteServerModeInbound,
    deleteServerModeClient,
    deleteServerModeAWGServer,
    deleteServerModeAWGPeer,
    updateServerModeField
  };
}
