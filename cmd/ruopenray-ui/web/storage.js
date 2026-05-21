export const routeNamesStorageKey = 'ruopenray_route_names';
export const disabledRouteRulesStorageKey = 'ruopenray_disabled_route_rules';
export const customRoutePresetsStorageKey = 'ruopenray_custom_route_presets';
export const savedPasswordStorageKey = 'ruopenray_saved_password';
export const firewallBypassModeStorageKey = 'ruopenray_firewall_bypass_mode';
export const firewallRouterModeStorageKey = 'ruopenray_firewall_router_mode';
export const firewallDeviceModeStorageKey = 'ruopenray_firewall_device_mode';
export const firewallSelectedDevicesStorageKey = 'ruopenray_firewall_selected_devices';
export const firewallKillSwitchDeviceModeStorageKey = 'ruopenray_firewall_kill_switch_device_mode';
export const firewallKillSwitchSelectedDevicesStorageKey = 'ruopenray_firewall_kill_switch_selected_devices';
export const firewallPortModeStorageKey = 'ruopenray_firewall_port_mode';
export const firewallPortsStorageKey = 'ruopenray_firewall_ports';
export const firewallBlockQuicStorageKey = 'ruopenray_firewall_block_quic';
export const firewallDnsInterceptStorageKey = 'ruopenray_firewall_dns_intercept';
export const firewallKillSwitchEnabledStorageKey = 'ruopenray_firewall_kill_switch_enabled';
export const firewallKillSwitchTargetsStorageKey = 'ruopenray_firewall_kill_switch_targets';
export const firewallKillSwitchDomainModeStorageKey = 'ruopenray_firewall_kill_switch_domain_mode';
export const xrayStatsResetAtStorageKey = 'ruopenray_xray_stats_reset_at';
export const setupSnapshotStorageKey = 'ruopenray_setup_snapshot';
export const domainMonitorFilterStorageKey = 'ruopenray_domain_monitor_filter';
export const installPasswordStorageKey = 'ruopenray_install_password';

export function randomPanelPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function initialInstallPassword() {
  const saved = localStorage.getItem(installPasswordStorageKey);
  if (saved) return saved;
  const generated = randomPanelPassword();
  localStorage.setItem(installPasswordStorageKey, generated);
  return generated;
}

export function shellQuote(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

export function loadRouteNames() {
  try {
    const names = JSON.parse(localStorage.getItem(routeNamesStorageKey) || '{}');
    return names && typeof names === 'object' && !Array.isArray(names) ? names : {};
  } catch {
    return {};
  }
}

export function loadDisabledRouteRules() {
  try {
    const items = JSON.parse(localStorage.getItem(disabledRouteRulesStorageKey) || '[]');
    return Array.isArray(items) ? items.filter((item) => item && item.rule) : [];
  } catch {
    return [];
  }
}

export function loadCustomRoutePresets() {
  try {
    const items = JSON.parse(localStorage.getItem(customRoutePresetsStorageKey) || '{}');
    if (!items || typeof items !== 'object' || Array.isArray(items)) return {};
    return Object.fromEntries(Object.entries(items).filter(([, preset]) => {
      return preset
        && typeof preset === 'object'
        && Array.isArray(preset.rules)
        && preset.rules.length
        && String(preset.title || '').trim();
    }));
  } catch {
    return {};
  }
}

export function loadStringListStorage(key) {
  try {
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
