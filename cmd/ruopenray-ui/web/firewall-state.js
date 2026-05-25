import {
  firewallBlockQuicStorageKey,
  firewallBypassModeStorageKey,
  firewallDeviceModeStorageKey,
  firewallDnsInterceptStorageKey,
  firewallKillSwitchDeviceModeStorageKey,
  firewallKillSwitchDomainModeStorageKey,
  firewallKillSwitchEnabledStorageKey,
  firewallKillSwitchSelectedDevicesStorageKey,
  firewallKillSwitchTargetsStorageKey,
  firewallPortModeStorageKey,
  firewallPortsStorageKey,
  firewallRouterModeStorageKey,
  firewallSelectedDevicesStorageKey,
  firewallStorageKeys
} from './storage.js';

export function hasStoredFirewallDraft(storage = localStorage) {
  return firewallStorageKeys.some((key) => storage.getItem(key) !== null);
}

export function firewallDraftFromStatus(status) {
  if (!status || typeof status !== 'object' || !status.persistent) return null;
  const routerMode = normalizeChoice(status.routerMode, ['tproxy', 'redirect'], 'tproxy');
  const bypassMode = normalizeChoice(status.bypassMode, ['off', 'bypass', 'redirect'], 'off');
  const deviceMode = normalizeChoice(status.deviceMode, ['all', 'selected', 'exclude'], 'all');
  const portMode = normalizeChoice(status.portMode, ['all', 'custom'], 'custom');
  const killSwitchDeviceMode = normalizeChoice(status.killSwitchDeviceMode, ['all', 'selected', 'exclude'], 'all');
  const killSwitchDomainMode = normalizeChoice(status.killSwitchDomainMode, ['dns-block', 'nftset'], 'dns-block');
  const ports = normalizeStringList(status.ports);
  const killSwitchDomains = normalizeStringList(status.killSwitchDomains);
  const killSwitchIps = normalizeStringList(status.killSwitchIps);

  return {
    firewallBypassMode: bypassMode,
    firewallRouterMode: routerMode,
    firewallDeviceMode: deviceMode,
    firewallSelectedDevices: normalizeStringList(status.devices),
    firewallKillSwitchDeviceMode: killSwitchDeviceMode,
    firewallKillSwitchSelectedDevices: normalizeStringList(status.killSwitchDevices),
    firewallPortMode: portMode,
    firewallPorts: portMode === 'all' ? '' : ports.join(','),
    firewallBlockQuic: Boolean(status.blockQuic),
    firewallDnsIntercept: Boolean(status.dnsIntercept),
    firewallKillSwitchEnabled: Boolean(status.killSwitch),
    firewallKillSwitchTargets: [...killSwitchDomains, ...killSwitchIps].join('\n'),
    firewallKillSwitchDomainMode: killSwitchDomainMode
  };
}

export function hydrateFirewallDraftFromStatus(state, status, options = {}) {
  const storage = options.storage || localStorage;
  if (!options.force && (state.firewallHydratedFromStatus || hasStoredFirewallDraft(storage))) return false;
  const draft = firewallDraftFromStatus(status);
  if (!draft) return false;
  applyFirewallDraftToState(state, draft);
  if (options.persist !== false) persistFirewallDraft(draft, storage);
  state.firewallHydratedFromStatus = true;
  return true;
}

export function applyFirewallDraftToState(state, draft) {
  Object.assign(state, {
    firewallBypassMode: draft.firewallBypassMode,
    firewallRouterMode: draft.firewallRouterMode,
    firewallDeviceMode: draft.firewallDeviceMode,
    firewallSelectedDevices: draft.firewallSelectedDevices,
    firewallKillSwitchDeviceMode: draft.firewallKillSwitchDeviceMode,
    firewallKillSwitchSelectedDevices: draft.firewallKillSwitchSelectedDevices,
    firewallPortMode: draft.firewallPortMode,
    firewallPorts: draft.firewallPorts,
    firewallBlockQuic: draft.firewallBlockQuic,
    firewallDnsIntercept: draft.firewallDnsIntercept,
    firewallKillSwitchEnabled: draft.firewallKillSwitchEnabled,
    firewallKillSwitchTargets: draft.firewallKillSwitchTargets,
    firewallKillSwitchDomainMode: draft.firewallKillSwitchDomainMode,
    firewallSafetyAccepted: false
  });
}

function persistFirewallDraft(draft, storage) {
  storage.setItem(firewallBypassModeStorageKey, draft.firewallBypassMode);
  storage.setItem(firewallRouterModeStorageKey, draft.firewallRouterMode);
  storage.setItem(firewallDeviceModeStorageKey, draft.firewallDeviceMode);
  storage.setItem(firewallSelectedDevicesStorageKey, JSON.stringify(draft.firewallSelectedDevices));
  storage.setItem(firewallKillSwitchDeviceModeStorageKey, draft.firewallKillSwitchDeviceMode);
  storage.setItem(firewallKillSwitchSelectedDevicesStorageKey, JSON.stringify(draft.firewallKillSwitchSelectedDevices));
  storage.setItem(firewallPortModeStorageKey, draft.firewallPortMode);
  storage.setItem(firewallPortsStorageKey, draft.firewallPorts);
  storage.setItem(firewallBlockQuicStorageKey, draft.firewallBlockQuic ? '1' : '0');
  storage.setItem(firewallDnsInterceptStorageKey, draft.firewallDnsIntercept ? '1' : '0');
  storage.setItem(firewallKillSwitchEnabledStorageKey, draft.firewallKillSwitchEnabled ? '1' : '0');
  storage.setItem(firewallKillSwitchTargetsStorageKey, draft.firewallKillSwitchTargets);
  storage.setItem(firewallKillSwitchDomainModeStorageKey, draft.firewallKillSwitchDomainMode);
}

function normalizeChoice(value, choices, fallback) {
  const clean = String(value || '').trim();
  return choices.includes(clean) ? clean : fallback;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  }
  const text = String(value || '').trim();
  if (!text || text === '<nil>') return [];
  return [...new Set(text.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];
}
