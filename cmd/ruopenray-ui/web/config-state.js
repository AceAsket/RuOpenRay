export function createConfigStateHelpers(state, { onDraftChange } = {}) {
  function hasSelectedAmneziaProfile() {
    const profiles = state.amneziaStatus?.clientConfig?.profiles || {};
    const items = Array.isArray(profiles.items) ? profiles.items : [];
    return items.some((item) => item.selected || item.active) ||
      (Array.isArray(profiles.selectedIds) && profiles.selectedIds.length > 0) ||
      (Array.isArray(state.amneziaSelectedProfileIds) && state.amneziaSelectedProfileIds.length > 0);
  }

  function ensureAutomaticAmneziaOutbound(config) {
    if (!config || typeof config !== 'object' || !hasSelectedAmneziaProfile()) return config;
    config.outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
    if (config.outbounds.some((outbound) => outbound?.tag === 'out-amnezia')) return config;
    config.outbounds.push({
      tag: 'out-amnezia',
      protocol: 'freedom',
      settings: { domainStrategy: 'UseIP' },
      streamSettings: { sockopt: { mark: 20992 } }
    });
    return config;
  }

  function syncConfig(config, options = {}) {
    config = ensureAutomaticAmneziaOutbound(config);
    const nextText = JSON.stringify(config, null, 2);
    const draftWasClean = !state.jsonDraft || state.jsonDraft === state.appliedConfigText || state.configApplying;
    const activeText = options.activeConfig
      ? JSON.stringify(options.activeConfig, null, 2)
      : options.fromServer
        ? nextText
        : state.appliedConfigText || nextText;
    state.config = config;
    if (!options.fromServer || draftWasClean || options.forceDraft) state.jsonDraft = nextText;
    state.appliedConfigText = activeText;
    if (options.serverDraft) {
      state.serverDraftExists = Boolean(options.serverDraft.exists);
      state.serverDraftSavedAt = options.serverDraft.updatedAt || '';
      state.serverDraftError = options.serverDraft.error || '';
    }
    if (!options.fromServer && options.persist !== false && typeof onDraftChange === 'function') {
      onDraftChange(config);
    }
  }
  
  function syncLoggingSettings(settings) {
    if (!settings?.ok) return;
    state.loggingSettings = settings;
    state.loggingLevel = settings.level || 'warning';
    state.loggingAccessLog = Boolean(settings.accessLog);
    state.loggingAccessPath = settings.accessPath || '/etc/ruopenray-ui/logs/access.log';
    state.loggingErrorLog = Boolean(settings.errorLog);
    state.loggingErrorPath = settings.errorPath || '/etc/ruopenray-ui/logs/error.log';
    state.loggingDnsLog = Boolean(settings.dnsLog);
    state.loggingMaxSizeMb = String(settings.maxSizeMb ?? 2);
    state.loggingRotateCopies = String(settings.rotateCopies ?? 1);
    state.loggingClearOnRestart = Boolean(settings.clearOnRestart);
  }
  
  function syncServiceSettings(settings) {
    if (!settings?.ok) return;
    state.serviceSettings = settings;
    state.serviceStartupDelaySec = String(settings.startupDelaySec ?? 0);
    state.serviceApplyDelaySec = String(settings.applyDelaySec ?? 0);
    state.serviceGoMemLimit = settings.goMemLimit || '48MiB';
    state.serviceGoGC = String(settings.goGC ?? 60);
    state.serviceDownloadMirror = settings.downloadMirror || 'direct';
    state.serviceMirrorPrefix = settings.mirrorPrefix || '';
  }
  
  function syncLanDnsStatus(status) {
    if (!status) return;
    state.lanDnsStatus = status;
    const plannedMode = status.plan?.mode;
    if (plannedMode) state.lanDnsMode = plannedMode;
    else if (status.mode && status.mode !== 'manual' && status.mode !== 'unknown') state.lanDnsMode = status.mode;
    if (Array.isArray(status.servers) && status.servers.length && status.mode === 'upstream') {
      state.lanDnsUpstream = status.servers[0];
    }
    const target = String(status.xrayTarget || status.suggestedXrayTarget || '');
    const targetPort = target.includes('#') ? target.split('#').pop() : '';
    if (!state.dnsInboundPort && targetPort) state.dnsInboundPort = targetPort;
    if (status.plan) {
      state.lanDnsPreview = status.plan;
    }
  }
  
  function lanDnsModeLabel(mode) {
    return ({
      xray: 'DNS через Xray',
      upstream: 'Внешний DNS / Pi-hole / AdGuard',
      system: 'Как в OpenWrt',
      manual: 'Ручная настройка',
      unknown: 'Неизвестно'
    })[mode] || 'Неизвестно';
  }

  return {
    syncConfig,
    syncLoggingSettings,
    syncServiceSettings,
    syncLanDnsStatus,
    lanDnsModeLabel
  };
}
