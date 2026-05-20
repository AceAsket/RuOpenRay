export function createConfigStateHelpers(state) {
  function syncConfig(config) {
    const nextText = JSON.stringify(config, null, 2);
    const draftWasClean = !state.jsonDraft || state.jsonDraft === state.appliedConfigText || state.configApplying;
    state.config = config;
    if (draftWasClean) state.jsonDraft = nextText;
    state.appliedConfigText = nextText;
  }
  
  function syncLoggingSettings(settings) {
    if (!settings?.ok) return;
    state.loggingSettings = settings;
    state.loggingLevel = settings.level || 'warning';
    state.loggingAccessLog = Boolean(settings.accessLog);
    state.loggingAccessPath = settings.accessPath || '/var/log/xray/access.log';
    state.loggingErrorLog = Boolean(settings.errorLog);
    state.loggingErrorPath = settings.errorPath || '/var/log/xray/error.log';
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
    if (status.plan) {
      state.lanDnsPreview = status.plan;
    }
  }
  
  function lanDnsModeLabel(mode) {
    return ({
      xray: 'DNS через Xray',
      upstream: 'Внешний DNS / Pi-hole',
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
