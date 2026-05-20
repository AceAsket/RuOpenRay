export function createFirewallActions({
  state,
  request,
  render,
  delay,
  firewallPayload,
  firewallCommands,
  firewallSafetyCheck,
  firewallReadyStatus,
  storageKeys
}) {
  const {
    firewallBypassModeStorageKey,
    firewallRouterModeStorageKey,
    firewallDeviceModeStorageKey,
    firewallPortModeStorageKey,
    firewallSelectedDevicesStorageKey,
    firewallBlockQuicStorageKey,
    firewallKillSwitchEnabledStorageKey,
    firewallKillSwitchDomainModeStorageKey,
    firewallKillSwitchTargetsStorageKey
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
    const safety = typeof firewallSafetyCheck === 'function' ? firewallSafetyCheck() : null;
    if (safety?.hasDanger && !state.firewallSafetyAccepted) {
      state.message = 'Firewall не применен: подтвердите опасные правила в блоке безопасности.';
      render();
      return;
    }
    state.firewallSaving = true;
    render();
    try {
      const result = await request('/api/firewall/apply', {
        method: 'POST',
        body: JSON.stringify(firewallPayload())
      });
      state.firewallStatus = result.status || result;
      state.message = result.ok
        ? 'Firewall-правила применены и сохранены для перезапуска firewall'
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
      state.message = result.ok ? 'Firewall-правила отключены' : 'Не удалось полностью отключить firewall-правила';
    } finally {
      state.firewallSaving = false;
      render();
    }
  }

  async function refreshFirewallStatus() {
    state.firewallStatus = await request('/api/firewall/status');
    render();
  }

  async function downloadFirewallRules() {
    state.firewallSaving = true;
    render();
    try {
      const payload = firewallPayload();
      const preview = await request('/api/firewall/preview', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const status = preview.status || await request('/api/firewall/status').catch(() => null);
      const report = [
        'RuOpenRay UI firewall report',
        `Generated: ${new Date().toISOString()}`,
        '',
        '== UI payload ==',
        JSON.stringify(payload, null, 2),
        '',
        '== Generated nftables ==',
        preview.nft || '',
        '',
        '== Active nftables on router ==',
        status?.nft?.stdout || 'not available',
        '',
        '== Policy routing ==',
        '-- ip rule show --',
        status?.ipRules?.stdout || 'not available',
        '',
        '-- ip route show table 100 --',
        status?.ipRoutes?.stdout || 'not available',
        '',
        '== Firewall status ==',
        JSON.stringify(status || {}, null, 2),
        '',
        '== Manual commands preview ==',
        typeof firewallCommands === 'function' ? firewallCommands() : '',
        ''
      ].join('\n');
      downloadText(`ruopenray-firewall-${dateStamp()}.txt`, report);
      state.message = 'Отчет по правилам firewall скачан';
    } catch (error) {
      state.message = error?.message || 'Не удалось скачать отчет по firewall';
    } finally {
      state.firewallSaving = false;
      render();
    }
  }

  function setFirewallBypassMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallBypassMode = ['off', 'bypass', 'redirect'].includes(mode) ? mode : 'off';
    localStorage.setItem(firewallBypassModeStorageKey, state.firewallBypassMode);
    render();
  }

  function setFirewallRouterMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallRouterMode = ['tproxy', 'redirect'].includes(mode) ? mode : 'tproxy';
    localStorage.setItem(firewallRouterModeStorageKey, state.firewallRouterMode);
    render();
  }

  function setFirewallDeviceMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallDeviceMode = ['all', 'selected', 'exclude'].includes(mode) ? mode : 'all';
    localStorage.setItem(firewallDeviceModeStorageKey, state.firewallDeviceMode);
    render();
  }

  function setFirewallPortMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallPortMode = mode === 'all' ? 'all' : 'custom';
    localStorage.setItem(firewallPortModeStorageKey, state.firewallPortMode);
    render();
  }

  function toggleFirewallDevice(ip, enabled) {
    resetFirewallSafetyAccept();
    const selected = new Set(state.firewallSelectedDevices);
    if (enabled) selected.add(ip);
    else selected.delete(ip);
    state.firewallSelectedDevices = [...selected];
    localStorage.setItem(firewallSelectedDevicesStorageKey, JSON.stringify(state.firewallSelectedDevices));
    render();
  }

  function setFirewallBlockQuic(enabled) {
    resetFirewallSafetyAccept();
    state.firewallBlockQuic = Boolean(enabled);
    localStorage.setItem(firewallBlockQuicStorageKey, state.firewallBlockQuic ? '1' : '0');
    render();
  }

  function setQuicPolicy(policy) {
    setFirewallBlockQuic(policy === 'block');
  }

  function setFirewallKillSwitchEnabled(enabled) {
    resetFirewallSafetyAccept();
    state.firewallKillSwitchEnabled = Boolean(enabled);
    localStorage.setItem(firewallKillSwitchEnabledStorageKey, state.firewallKillSwitchEnabled ? '1' : '0');
    render();
  }

  function setFirewallKillSwitchDomainMode(mode) {
    resetFirewallSafetyAccept();
    state.firewallKillSwitchDomainMode = mode === 'nftset' ? 'nftset' : 'dns-block';
    localStorage.setItem(firewallKillSwitchDomainModeStorageKey, state.firewallKillSwitchDomainMode);
    render();
  }

  function setFirewallKillSwitchTargets(value) {
    resetFirewallSafetyAccept();
    state.firewallKillSwitchTargets = value;
    localStorage.setItem(firewallKillSwitchTargetsStorageKey, state.firewallKillSwitchTargets);
  }

  function resetFirewallSafetyAccept() {
    state.firewallSafetyAccepted = false;
  }

  return {
    applyFirewallWithRetry,
    applyFirewall,
    disableFirewall,
    refreshFirewallStatus,
    downloadFirewallRules,
    setFirewallBypassMode,
    setFirewallRouterMode,
    setFirewallDeviceMode,
    setFirewallPortMode,
    toggleFirewallDevice,
    setFirewallBlockQuic,
    setQuicPolicy,
    setFirewallKillSwitchEnabled,
    setFirewallKillSwitchDomainMode,
    setFirewallKillSwitchTargets
  };
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
