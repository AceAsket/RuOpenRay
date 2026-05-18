export function createFirewallActions({
  state,
  request,
  render,
  delay,
  firewallPayload,
  firewallReadyStatus,
  storageKeys
}) {
  const {
    firewallBypassModeStorageKey,
    firewallRouterModeStorageKey,
    firewallDeviceModeStorageKey,
    firewallPortModeStorageKey,
    firewallSelectedDevicesStorageKey,
    firewallBlockQuicStorageKey
  } = storageKeys;

  async function applyFirewallWithRetry(attempts = 2) {
    let lastResult = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await delay(1200);
      lastResult = await request('/api/firewall/apply', {
        method: 'POST',
        body: JSON.stringify(firewallPayload())
      });
      state.firewallStatus = lastResult.status || lastResult;
      if (lastResult.ok && firewallReadyStatus(state.firewallStatus)) return lastResult;

      await delay(800);
      const status = await request('/api/firewall/status').catch(() => null);
      if (status) state.firewallStatus = status;
      if (firewallReadyStatus(state.firewallStatus)) {
        return { ok: true, status: state.firewallStatus, retried: attempt > 0 };
      }
    }
    return lastResult || { ok: false, status: state.firewallStatus };
  }

  async function applyFirewall() {
    state.firewallSaving = true;
    render();
    try {
      const result = await request('/api/firewall/apply', {
        method: 'POST',
        body: JSON.stringify(firewallPayload())
      });
      state.firewallStatus = result.status || result;
      state.message = result.ok
        ? 'Перехват применен и сохранен для перезапуска firewall'
        : (result.error || 'Не удалось применить перехват');
    } finally {
      state.firewallSaving = false;
      render();
    }
  }

  async function disableFirewall() {
    state.firewallSaving = true;
    render();
    try {
      const result = await request('/api/firewall/disable', { method: 'POST' });
      state.firewallStatus = result.status || result;
      state.message = result.ok ? 'Перехват отключен' : 'Не удалось полностью отключить перехват';
    } finally {
      state.firewallSaving = false;
      render();
    }
  }

  async function refreshFirewallStatus() {
    state.firewallStatus = await request('/api/firewall/status');
    render();
  }

  function setFirewallBypassMode(mode) {
    state.firewallBypassMode = ['off', 'bypass', 'redirect'].includes(mode) ? mode : 'off';
    localStorage.setItem(firewallBypassModeStorageKey, state.firewallBypassMode);
    render();
  }

  function setFirewallRouterMode(mode) {
    state.firewallRouterMode = ['tproxy', 'redirect'].includes(mode) ? mode : 'tproxy';
    localStorage.setItem(firewallRouterModeStorageKey, state.firewallRouterMode);
    render();
  }

  function setFirewallDeviceMode(mode) {
    state.firewallDeviceMode = ['all', 'selected', 'exclude'].includes(mode) ? mode : 'all';
    localStorage.setItem(firewallDeviceModeStorageKey, state.firewallDeviceMode);
    render();
  }

  function setFirewallPortMode(mode) {
    state.firewallPortMode = mode === 'all' ? 'all' : 'custom';
    localStorage.setItem(firewallPortModeStorageKey, state.firewallPortMode);
    render();
  }

  function toggleFirewallDevice(ip, enabled) {
    const selected = new Set(state.firewallSelectedDevices);
    if (enabled) selected.add(ip);
    else selected.delete(ip);
    state.firewallSelectedDevices = [...selected];
    localStorage.setItem(firewallSelectedDevicesStorageKey, JSON.stringify(state.firewallSelectedDevices));
    render();
  }

  function setFirewallBlockQuic(enabled) {
    state.firewallBlockQuic = Boolean(enabled);
    localStorage.setItem(firewallBlockQuicStorageKey, state.firewallBlockQuic ? '1' : '0');
    render();
  }

  function setQuicPolicy(policy) {
    setFirewallBlockQuic(policy === 'block');
  }


  return {
    applyFirewallWithRetry,
    applyFirewall,
    disableFirewall,
    refreshFirewallStatus,
    setFirewallBypassMode,
    setFirewallRouterMode,
    setFirewallDeviceMode,
    setFirewallPortMode,
    toggleFirewallDevice,
    setFirewallBlockQuic,
    setQuicPolicy
  };
}
