export function createUpdatesActions({
  state,
  request,
  render,
  refresh,
  geoSelectedPresetIds
}) {
  async function updateCore() {
    const version = state.selectedCoreVersion || '';
    if (!version) {
      state.message = 'Сначала выберите версию Xray-core';
      render();
      return;
    }
    state.coreUpdating = true;
    state.message = `Устанавливаю Xray-core ${version}...`;
    render();
    try {
      const result = await request('/api/core/update', { method: 'POST', body: JSON.stringify({ version, backup: state.coreBackup }) });
      state.coreUpdate = result;
      state.coreDialogOpen = false;
      state.message = result.ok
        ? `Ядро Xray установлено: ${result.after || version}`
        : result.stderr || result.message || 'Не удалось обновить ядро Xray';
      await refresh();
    } finally {
      state.coreUpdating = false;
      render();
    }
  }

  async function updateApp() {
    const target = state.appRelease?.tag || '';
    if (!target) {
      state.message = 'Не удалось получить последний релиз RuOpenRay UI';
      render();
      return;
    }
    state.appUpdating = true;
    state.message = `Обновляю RuOpenRay UI до ${target}...`;
    render();
    try {
      const result = await request('/api/app/update', {
        method: 'POST',
        body: JSON.stringify({ version: target, backup: state.appBackup })
      });
      state.appUpdate = result;
      state.message = result.ok
        ? `RuOpenRay UI обновлен до ${result.version || target}. Сервис перезапускается.`
        : result.stderr || 'Не удалось обновить RuOpenRay UI';
      if (result.ok) {
        setTimeout(() => refresh().catch(() => {}), 2500);
      } else {
        await refresh();
      }
    } finally {
      state.appUpdating = false;
      render();
    }
  }

  async function checkAppUpdate() {
    state.appReleaseChecking = true;
    state.message = 'Проверяю обновления RuOpenRay UI...';
    render();
    try {
      const result = await request('/api/app/releases');
      state.appRelease = result?.release || null;
      if (result?.version && state.status?.app) {
        state.status = {
          ...(state.status || {}),
          app: { ...(state.status.app || {}), version: result.version, asset: result.asset || state.status.app.asset }
        };
      }
      const release = state.appRelease || {};
      state.message = release.update && release.assetUrl
        ? `Доступно обновление RuOpenRay UI: ${release.current || result.version || 'текущая'} → ${release.tag}`
        : `RuOpenRay UI актуален: ${result?.version || state.status?.app?.version || 'dev'}`;
    } catch (error) {
      state.message = error.message || 'Не удалось проверить обновления RuOpenRay UI';
    } finally {
      state.appReleaseChecking = false;
      render();
    }
  }

  async function appVersionClick() {
    const release = state.appRelease || {};
    if (release.update && release.assetUrl) {
      state.tab = 'settings';
      state.settingsView = 'updates';
      state.message = `Доступно обновление RuOpenRay UI: ${release.current || state.status?.app?.version || 'текущая'} → ${release.tag}`;
      render();
      return;
    }
    await checkAppUpdate();
    if (state.appRelease?.update && state.appRelease?.assetUrl) {
      state.tab = 'settings';
      state.settingsView = 'updates';
      render();
    }
  }

  async function updateGeo() {
    state.geoUpdating = true;
    state.message = 'Обновляю geoip.dat и geosite.dat...';
    render();
    try {
      const presets = geoSelectedPresetIds();
      const result = await request('/api/geo/update', {
        method: 'POST',
        body: JSON.stringify({
          preset: state.geoBasePreset,
          presets,
          customSourceIds: state.geoCustomSourceIds,
          geoipUrl: state.geoipUrl,
          geositeUrl: state.geositeUrl,
          backup: state.geoBackup
        })
      });
      state.geoUpdate = result;
      state.geoStatus = result.status || state.geoStatus;
      state.message = result.ok ? 'Geo-файлы обновлены, Xray перезапущен' : result.stderr || 'Не удалось обновить geo-файлы';
      await refresh();
    } finally {
      state.geoUpdating = false;
      render();
    }
  }

  async function saveGeoSchedule() {
    const result = await request('/api/geo/schedule', {
      method: 'POST',
      body: JSON.stringify({
        enabled: state.geoScheduleEnabled,
        interval: state.geoScheduleInterval,
        weekday: state.geoScheduleWeekday,
        time: state.geoScheduleTime,
        preset: state.geoBasePreset,
        presets: geoSelectedPresetIds(),
        customSourceIds: state.geoCustomSourceIds,
        geoipUrl: state.geoipUrl,
        geositeUrl: state.geositeUrl,
        backup: state.geoBackup
      })
    });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Расписание geo сохранено';
    render();
  }

  async function installCorePackage() {
    state.coreUpdating = true;
    state.installStep = 'installing';
    state.message = 'Устанавливаю Xray из пакетов OpenWrt...';
    render();
    try {
      const result = await request('/api/core/update', { method: 'POST', body: JSON.stringify({ version: '' }) });
      state.coreUpdate = result;
      state.coreDialogOpen = false;
      state.installStep = result.ok ? 'done' : 'error';
      state.message = result.ok ? `Xray установлен: ${result.after || 'проверьте статус'}` : result.stderr || result.stdout || 'Не удалось установить Xray';
      await refresh();
      state.installPlan = await request('/api/install/plan').catch(() => state.installPlan);
    } finally {
      state.coreUpdating = false;
    }
    render();
  }

  async function cleanupGeoBackups() {
    const result = await request('/api/geo/cleanup', { method: 'POST', body: '{}' });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Geo-бэкапы очищены';
    render();
  }

  async function deleteGeoFile(file) {
    const name = String(file || '').trim();
    if (!name) return;
    if (!confirm(`Удалить ${name}? Если активные правила ссылаются на этот файл, следующая проверка конфигурации покажет ошибку.`)) return;
    const result = await request('/api/geo/delete', {
      method: 'POST',
      body: JSON.stringify({ files: [name] })
    });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.ok ? result.stdout || `${name} удален` : result.stderr || `Не удалось удалить ${name}`;
    render();
  }

  async function cleanupExtraGeoDat() {
    const files = (state.geoStatus?.files || [])
      .filter((file) => file.role === 'extra' && file.exists !== false)
      .map((file) => file.name)
      .filter(Boolean);
    if (!files.length) {
      state.message = 'Дополнительных dat-файлов для удаления нет';
      return render();
    }
    if (!confirm(`Удалить дополнительные dat-файлы: ${files.join(', ')}?`)) return;
    const result = await request('/api/geo/delete', {
      method: 'POST',
      body: JSON.stringify({ files })
    });
    state.geoUpdate = result;
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.ok ? result.stdout || 'Дополнительные dat-файлы удалены' : result.stderr || 'Не удалось удалить дополнительные dat-файлы';
    render();
  }

  function cleanGeoSourcePayload(source = {}) {
    const name = String(source.name || '').trim();
    const kind = source.kind === 'extra' ? 'extra' : 'base';
    return {
      id: source.id || '',
      name,
      kind,
      geoipUrl: String(source.geoipUrl || '').trim(),
      geositeUrl: String(source.geositeUrl || '').trim(),
      url: String(source.url || '').trim(),
      target: String(source.target || '').trim(),
      enabled: source.enabled !== false
    };
  }

  async function saveGeoSources(sources) {
    const result = await request('/api/geo/sources', {
      method: 'POST',
      body: JSON.stringify({ sources })
    });
    state.geoCustomSources = result.sources || [];
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Свои источники geodata сохранены';
    render();
  }

  async function addGeoSource() {
    const source = cleanGeoSourcePayload({
      name: state.geoSourceName,
      kind: state.geoSourceKind,
      geoipUrl: state.geoSourceGeoipUrl,
      geositeUrl: state.geoSourceGeositeUrl,
      url: state.geoSourceUrl,
      target: state.geoSourceTarget,
      enabled: true
    });
    if (!source.name) {
      state.message = 'Укажите название источника geodata';
      render();
      return;
    }
    if (source.kind === 'base' && (!source.geoipUrl || !source.geositeUrl)) {
      state.message = 'Для базового источника нужны ссылки на geoip.dat и geosite.dat';
      render();
      return;
    }
    if (source.kind === 'extra' && (!source.url || !source.target)) {
      state.message = 'Для дополнительного dat-файла нужны URL и имя файла';
      render();
      return;
    }
    const next = [...state.geoCustomSources, source];
    state.geoSourceName = '';
    state.geoSourceGeoipUrl = '';
    state.geoSourceGeositeUrl = '';
    state.geoSourceUrl = '';
    state.geoSourceTarget = '';
    await saveGeoSources(next);
  }

  async function removeGeoSource(id) {
    state.geoCustomSourceIds = state.geoCustomSourceIds.filter((item) => item !== id);
    await saveGeoSources(state.geoCustomSources.filter((source) => source.id !== id));
  }

  async function toggleGeoSourceEnabled(id, enabled) {
    await saveGeoSources(state.geoCustomSources.map((source) => (source.id === id ? { ...source, enabled } : source)));
  }

  return {
    updateCore,
    updateApp,
    checkAppUpdate,
    appVersionClick,
    updateGeo,
    saveGeoSchedule,
    installCorePackage,
    cleanupGeoBackups,
    deleteGeoFile,
    cleanupExtraGeoDat,
    cleanGeoSourcePayload,
    saveGeoSources,
    addGeoSource,
    removeGeoSource,
    toggleGeoSourceEnabled
  };
}
