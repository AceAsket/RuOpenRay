import { createAppUpdateMonitor } from './app-update-monitor.js';

export function createUpdatesActions({
  state,
  request,
  upload = null,
  render,
  refresh,
  geoSelectedPresetIds,
  canReloadApp,
  reloadApp,
  confirmReload,
  updateMonitorOptions = {}
}) {
  const appMonitor = createAppUpdateMonitor({ state, request, render, canReloadApp, reloadApp, confirmReload, ...updateMonitorOptions });

  async function updateCore() {
    if (state.status?.core?.available === false) {
      state.coreDialogOpen = false;
      state.installWizardOpen = true;
      state.installStep = 'plan';
      state.message = 'Сначала установите Xray через пакетный мастер OpenWrt. Выбор релиза GitHub доступен после установки пакета.';
      state.installPlan = await request('/api/install/plan');
      render();
      return;
    }
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
    if (state.appUpdating) return;
    const target = state.appRelease?.tag || '';
    if (!target) {
      state.message = 'Не удалось получить последний релиз RuOpenRay UI';
      render();
      return;
    }
    const digest = String(state.appRelease?.assetDigest || '');
    const attempt = appMonitor.prepare(target, /^sha256:[a-f\d]{64}$/i.test(digest) ? digest.slice(7).toLowerCase() : '');
    state.message = `Обновляю RuOpenRay UI до ${target}...`;
    render();
    try {
      const result = await request('/api/app/update', {
        method: 'POST',
        body: JSON.stringify({ version: target, backup: state.appBackup, channel: state.appChannel || 'stable', updateId: attempt.updateId })
      });
      if (result.ok) {
        appMonitor.track(result);
      } else {
        appMonitor.stop();
        state.appUpdate = result;
        state.message = result.stderr || 'Не удалось обновить RuOpenRay UI';
      }
    } catch (error) {
      if (error?.status) {
        appMonitor.stop();
        state.appUpdate = { ok: false, stderr: error.message || 'Сервер отклонил обновление' };
        state.message = state.appUpdate.stderr;
      } else {
        state.message = 'Связь прервалась во время обновления. Проверяю окончательный результат после перезапуска панели.';
        appMonitor.resume();
      }
    } finally {
      render();
    }
  }

  async function checkAppUpdate() {
    state.appReleaseChecking = true;
    state.message = 'Проверяю обновления RuOpenRay UI...';
    render();
    try {
      const result = await request(`/api/app/releases?channel=${state.appChannel || 'stable'}`);
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
        : release.reason || 'В выбранном канале нет доступного обновления';
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

  async function checkGeoAudit() {
    state.geoUpdating = true;
    state.message = 'Проверяю geo-списки через Xray...';
    render();
    try {
      let config = state.config || {};
      try {
        config = JSON.parse(state.jsonDraft || JSON.stringify(config));
      } catch {
        // Geo Doctor can still check the last valid draft while the JSON editor is being fixed.
      }
      const result = await request('/api/geo/audit', {
        method: 'POST',
        body: JSON.stringify({ config })
      });
      state.geoUpdate = result;
      state.geoStatus = result.status || state.geoStatus;
      state.message = result.stdout || (result.ok ? 'Geo-списки проверены' : 'В geo-списках есть проблемы');
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
    state.message = result.ok
      ? result.stdout || 'Расписание geo сохранено'
      : result.stderr || result.error || 'Не удалось сохранить расписание geo';
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
    state.message = result.ok
      ? result.stdout || 'Резервные копии geo очищены'
      : result.stderr || result.error || 'Не удалось завершить очистку geo-бэкапов';
    render();
  }

  async function uploadGeoFile() {
    const file = state.geoUploadFile || document.querySelector('#geoUploadFile')?.files?.[0] || null;
    if (!file) {
      state.message = 'Выберите dat-файл для загрузки';
      render();
      return;
    }
    if (!String(file.name || '').toLowerCase().endsWith('.dat')) {
      state.message = 'Можно загрузить только файл с расширением .dat';
      render();
      return;
    }
    if (!upload) {
      state.message = 'Загрузка файлов недоступна в этом режиме панели';
      render();
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('target', state.geoUploadTarget || 'geosite');
    form.append('name', state.geoUploadName || '');
    form.append('backup', state.geoUploadBackup ? '1' : '0');
    form.append('restart', state.geoUploadRestart ? '1' : '0');
    state.geoUpdating = true;
    state.message = `Загружаю ${file.name}...`;
    render();
    try {
      const result = await upload('/api/geo/upload', form);
      state.geoUpdate = result;
      state.geoStatus = result.status || state.geoStatus;
      state.message = result.ok ? result.stdout || 'dat-файл загружен' : result.stderr || 'Не удалось загрузить dat-файл';
      if (result.ok) {
        state.geoUploadFile = null;
        const input = document.querySelector('#geoUploadFile');
        if (input) input.value = '';
      }
      await refresh();
    } finally {
      state.geoUpdating = false;
      render();
    }
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
    const kind = source.kind === 'extra' || source.kind === 'separate' ? source.kind : 'base';
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
    if (!result.ok) throw new Error(result.stderr || result.error || 'Не удалось сохранить источники geodata');
    state.geoCustomSources = result.sources || [];
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Свои источники geodata сохранены';
  }

  async function saveGeoPresetOverrides(overrides) {
    const result = await request('/api/geo/preset-overrides', {
      method: 'POST',
      body: JSON.stringify({ overrides })
    });
    if (!result.ok) throw new Error(result.stderr || result.error || 'Не удалось сохранить переопределение');
    state.geoPresetOverrides = result.overrides || {};
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Переопределения geo-источников сохранены';
  }

  async function addGeoSource() {
    if (state.geoSourceSaving) return;
    const editingId = String(state.geoSourceEditingId || '').trim();
    const presetEditingId = String(state.geoPresetEditingId || '').trim();
    const presetEditing = presetEditingId
      ? (state.geoStatus?.presets || []).find((item) => item.id === presetEditingId)
      : null;
    const mode = sourceMode(state.geoSourceKind, presetEditing?.mode);
    const source = cleanGeoSourcePayload({
      id: editingId || presetEditingId,
      name: state.geoSourceName,
      kind: state.geoSourceKind,
      geoipUrl: state.geoSourceGeoipUrl,
      geositeUrl: state.geoSourceGeositeUrl,
      url: state.geoSourceUrl,
      target: state.geoSourceTarget,
      enabled: true
    });
    const error = geoSourceValidationError(source, mode);
    if (error) {
      state.geoSourceNotice = { error: true, text: error };
      render();
      return;
    }
    await changeGeoSources(async () => {
      if (presetEditingId) {
        const override = { name: source.name, mode, enabled: true };
        if (mode === 'extra-geosite') {
          override.geositeUrl = source.url;
          override.target = source.target;
        } else {
          override.geoipUrl = source.geoipUrl;
          if (mode !== 'geoip-only') override.geositeUrl = source.geositeUrl;
          if (mode === 'separate') override.target = source.target;
        }
        await saveGeoPresetOverrides({ ...(state.geoPresetOverrides || {}), [presetEditingId]: override });
      } else {
        const next = editingId
          ? state.geoCustomSources.map((item) => (item.id === editingId ? { ...source, enabled: item.enabled !== false } : item))
          : [...state.geoCustomSources, source];
        await saveGeoSources(next);
      }
      resetGeoSourceForm();
    }, 'Источник сохранён. Чтобы скачать DAT, выберите источник и нажмите «Обновить geo».');
  }

  function sourceMode(kind, presetMode) {
    if (kind === 'extra') return 'extra-geosite';
    if (kind === 'separate') return 'separate';
    return presetMode === 'geoip-only' ? 'geoip-only' : 'replace';
  }

  function geoSourceValidationError(source, mode) {
    if (!source.name) return 'Укажите название источника geodata';
    if (source.kind !== 'base' && !source.target) {
      return source.kind === 'extra' ? 'Укажите имя DAT-файла' : 'Задайте короткое имя источника, например runet';
    }
    const urls = mode === 'extra-geosite' ? [source.url] : [source.geoipUrl];
    if (mode === 'separate' || mode === 'replace') urls.push(source.geositeUrl);
    if (!urls.every(validGeoSourceURL)) {
      return 'Укажите прямые HTTP(S)-ссылки на DAT-файлы';
    }
    return '';
  }

  function validGeoSourceURL(value) {
    if (!/^https?:\/\//i.test(value)) return false;
    try {
      return Boolean(new URL(value).hostname);
    } catch {
      return false;
    }
  }

  async function changeGeoSources(save, successText) {
    if (state.geoSourceSaving) return;
    state.geoSourceSaving = true;
    state.geoSourceNotice = null;
    render();
    try {
      await save();
      state.geoSourceNotice = { text: successText || state.message };
    } catch (error) {
      state.message = error.message;
      state.geoSourceNotice = { error: true, text: error.message };
    } finally {
      state.geoSourceSaving = false;
      render();
    }
  }

  function resetGeoSourceForm() {
    state.geoSourceNotice = null;
    state.geoPresetEditingId = '';
    state.geoSourceEditingId = '';
    state.geoSourceName = '';
    state.geoSourceKind = 'base';
    state.geoSourceGeoipUrl = '';
    state.geoSourceGeositeUrl = '';
    state.geoSourceUrl = '';
    state.geoSourceTarget = '';
  }

  function editGeoPreset(id) {
    if (state.geoSourceSaving) return;
    const preset = (state.geoStatus?.presets || []).find((item) => item.id === id);
    if (!preset) return;
    resetGeoSourceForm();
    state.geoPresetEditingId = preset.id;
    state.geoSourceName = preset.name || '';
    state.geoSourceKind = preset.mode === 'extra-geosite' ? 'extra' : preset.mode === 'separate' ? 'separate' : 'base';
    state.geoSourceGeoipUrl = preset.geoipUrl || '';
    state.geoSourceGeositeUrl = preset.geositeUrl || '';
    state.geoSourceUrl = preset.mode === 'extra-geosite' ? preset.geositeUrl || '' : '';
    state.geoSourceTarget = preset.target || '';
    render();
  }

  async function resetGeoPresetOverride(id) {
    await changeGeoSources(async () => {
      const next = { ...(state.geoPresetOverrides || {}) };
      delete next[id];
      await saveGeoPresetOverrides(next);
      if (state.geoPresetEditingId === id) resetGeoSourceForm();
    });
  }

  function editGeoSource(id) {
    if (state.geoSourceSaving) return;
    const source = state.geoCustomSources.find((item) => item.id === id);
    if (!source) return;
    resetGeoSourceForm();
    state.geoSourceEditingId = source.id;
    state.geoSourceName = source.name || '';
    state.geoSourceKind = source.kind === 'extra' || source.kind === 'separate' ? source.kind : 'base';
    state.geoSourceGeoipUrl = source.geoipUrl || '';
    state.geoSourceGeositeUrl = source.geositeUrl || '';
    state.geoSourceUrl = source.url || '';
    state.geoSourceTarget = source.target || '';
    render();
  }

  function cancelGeoSourceEdit() {
    if (state.geoSourceSaving) return;
    resetGeoSourceForm();
    render();
  }

  async function removeGeoSource(id) {
    await changeGeoSources(async () => {
      await saveGeoSources(state.geoCustomSources.filter((source) => source.id !== id));
      state.geoCustomSourceIds = state.geoCustomSourceIds.filter((item) => item !== id);
      if (state.geoSourceEditingId === id) resetGeoSourceForm();
    });
  }

  async function toggleGeoSourceEnabled(id, enabled) {
    await changeGeoSources(() => saveGeoSources(state.geoCustomSources.map((source) => (source.id === id ? { ...source, enabled } : source))));
  }

  function cleanGeoListPayload(list = {}) {
    return {
      id: String(list.id || '').trim(),
      name: String(list.name || '').trim(),
      kind: list.kind === 'ip' ? 'ip' : 'domain',
      target: ['direct', 'block'].includes(list.target) ? list.target : 'proxy',
      items: Array.isArray(list.items)
        ? list.items.map((item) => String(item || '').trim()).filter(Boolean)
        : String(list.items || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      enabled: list.enabled !== false,
      updatedAt: list.updatedAt || new Date().toISOString()
    };
  }

  async function saveGeoLists(lists) {
    const result = await request('/api/geo/lists', {
      method: 'POST',
      body: JSON.stringify({ lists })
    });
    if (!result.ok) throw new Error(result.stderr || result.error || 'Не удалось сохранить geo-списки');
    state.geoUserLists = result.lists || [];
    state.geoStatus = result.status || state.geoStatus;
    state.message = result.stdout || 'Пользовательские geo-списки сохранены';
  }

  async function changeGeoLists(save) {
    if (state.geoListSaving) return;
    state.geoListSaving = true;
    state.geoListNotice = null;
    render();
    try {
      await save();
      state.geoListNotice = { text: state.message };
    } catch (error) {
      state.message = error.message;
      state.geoListNotice = { error: true, text: error.message };
    } finally {
      state.geoListSaving = false;
      render();
    }
  }

  async function addGeoList() {
    if (state.geoListSaving || state.geoCatalogLoading || state.geoUpdating) return;
    const editingId = String(state.geoListEditingId || '').trim();
    const list = cleanGeoListPayload({
      id: editingId,
      name: state.geoListName,
      kind: state.geoListKind,
      target: state.geoListTarget,
      items: state.geoListItems,
      enabled: true
    });
    if (!list.name) {
      state.geoListNotice = { error: true, text: 'Укажите название geo-списка' };
      render();
      return;
    }
    if (!list.items.length) {
      state.geoListNotice = { error: true, text: 'Добавьте хотя бы один домен, IP или подсеть' };
      render();
      return;
    }
    const next = editingId
      ? state.geoUserLists.map((item) => (item.id === editingId ? { ...list, enabled: item.enabled !== false } : item))
      : [...state.geoUserLists, list];
    await changeGeoLists(async () => {
      await saveGeoLists(next);
      resetGeoListForm();
    });
  }

  function resetGeoListForm() {
    state.geoListNotice = null;
    state.geoListEditingId = '';
    state.geoListName = '';
    state.geoListKind = 'domain';
    state.geoListTarget = 'proxy';
    state.geoListItems = '';
    state.geoCatalogEditKind = '';
    state.geoCatalogEditCode = '';
    state.geoCatalogEditFile = '';
    state.geoCatalogEditTruncated = false;
  }

  function editGeoList(id) {
    if (state.geoListSaving) return;
    const list = state.geoUserLists.find((item) => item.id === id);
    if (!list) return;
    state.geoListNotice = null;
    state.geoListEditingId = list.id || '';
    state.geoListName = list.name || '';
    state.geoListKind = list.kind === 'ip' ? 'ip' : 'domain';
    state.geoListTarget = ['direct', 'block'].includes(list.target) ? list.target : 'proxy';
    state.geoListItems = Array.isArray(list.items) ? list.items.join('\n') : '';
    state.geoCatalogEditKind = '';
    state.geoCatalogEditCode = '';
    state.geoCatalogEditFile = '';
    state.geoCatalogEditTruncated = false;
    render();
  }

  function cancelGeoListEdit() {
    if (state.geoListSaving) return;
    resetGeoListForm();
    render();
  }

  async function loadGeoCatalog(kind, file = '') {
    const safeKind = kind === 'geoip' ? 'geoip' : 'geosite';
    if (file && state.geoCatalog?.file === file && !state.geoCatalogLoading) {
      state.geoCatalog = null;
      state.geoCatalogSearch = '';
      render();
      return;
    }
    state.geoCatalogLoading = true;
    state.geoCatalog = { kind: safeKind, file };
    render();
    try {
      const filePart = file ? `&file=${encodeURIComponent(file)}` : '';
      const result = await request(`/api/geo/catalog?kind=${encodeURIComponent(safeKind)}${filePart}`);
      state.geoCatalog = result;
      state.message = result.ok
        ? `${result.file || safeKind} открыт: ${(result.categories || []).length} категорий`
        : (result.stderr || result.error || 'Не удалось открыть dat-файл');
    } finally {
      state.geoCatalogLoading = false;
      render();
    }
  }

  async function openGeoCatalogCategory(kind, code, full = false, file = '') {
    if (state.geoListSaving) return;
    const safeKind = kind === 'geoip' ? 'geoip' : 'geosite';
    const safeCode = String(code || '').trim();
    if (!safeCode) return;
    if (full && !confirm(`Открыть категорию ${safeCode} полностью? Большие DAT-списки могут долго загружаться и занять много памяти в браузере.`)) {
      return;
    }
    state.geoCatalogLoading = true;
    state.geoListNotice = null;
    render();
    try {
      const fullFlag = full ? '&full=1' : '';
      const filePart = file ? `&file=${encodeURIComponent(file)}` : '';
      const result = await request(`/api/geo/catalog?kind=${encodeURIComponent(safeKind)}&code=${encodeURIComponent(safeCode)}${fullFlag}${filePart}`);
      if (!result.ok) {
        state.message = result.stderr || result.error || 'Не удалось открыть категорию';
        return;
      }
      const items = Array.isArray(result.items) ? result.items : [];
      state.geoListEditingId = '';
      state.geoListName = `${safeCode} из ${result.file || (safeKind === 'geoip' ? 'geoip.dat' : 'geosite.dat')}`;
      state.geoListKind = safeKind === 'geoip' ? 'ip' : 'domain';
      state.geoListTarget = 'proxy';
      state.geoListItems = items.join('\n');
      state.geoCatalogEditKind = safeKind;
      state.geoCatalogEditCode = safeCode;
      state.geoCatalogEditFile = result.file || (safeKind === 'geoip' ? 'geoip.dat' : 'geosite.dat');
      state.geoCatalogEditTruncated = Boolean(result.truncated);
      state.message = result.truncated
        ? `Категория ${safeCode} открыта частично: первые ${items.length} записей`
        : `Категория ${safeCode} открыта в редакторе: ${items.length} записей`;
    } finally {
      state.geoCatalogLoading = false;
      render();
    }
  }

  async function saveGeoCatalogCategory() {
    const kind = String(state.geoCatalogEditKind || '').trim();
    const code = String(state.geoCatalogEditCode || '').trim();
    if (state.geoCatalogEditTruncated) {
      state.message = 'Категория DAT открыта частично. Сохраните ее как новый список RuOpenRay или уточните категорию, чтобы не обрезать установленный DAT.';
      render();
      return;
    }
    if (!kind || !code) {
      state.message = 'Сначала откройте категорию из geosite.dat или geoip.dat';
      render();
      return;
    }
    if (!confirm(`Изменить категорию ${code} в ${state.geoCatalogEditFile || (kind === 'geoip' ? 'geoip.dat' : 'geosite.dat')}? RuOpenRay сохранит резервную копию, перезапишет DAT и перезапустит Xray.`)) {
      return;
    }
    state.geoUpdating = true;
    state.message = `Сохраняю категорию ${code} в DAT...`;
    render();
    try {
      const result = await request('/api/geo/catalog', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          code,
          file: state.geoCatalogEditFile,
          items: state.geoListItems,
          backup: true
        })
      });
      state.geoUpdate = result;
      state.geoStatus = result.status || state.geoStatus;
      state.message = result.ok ? result.stdout || 'Категория DAT сохранена' : result.stderr || 'Не удалось сохранить категорию DAT';
      if (result.ok) {
        await loadGeoCatalog(kind, result.file || state.geoCatalogEditFile);
      }
    } finally {
      state.geoUpdating = false;
      render();
    }
  }

  async function removeGeoList(id) {
    await changeGeoLists(async () => {
      await saveGeoLists(state.geoUserLists.filter((list) => list.id !== id));
      if (state.geoListEditingId === id) resetGeoListForm();
    });
  }

  async function toggleGeoListEnabled(id, enabled) {
    await changeGeoLists(() => saveGeoLists(state.geoUserLists.map((list) => (list.id === id ? { ...list, enabled } : list))));
  }

  return {
    updateCore,
    updateApp,
    resumeAppUpdate: appMonitor.resume,
    reloadUpdatedApp: appMonitor.reloadUpdatedApp,
    checkAppUpdate,
    appVersionClick,
    updateGeo,
    checkGeoAudit,
    saveGeoSchedule,
    installCorePackage,
    cleanupGeoBackups,
    uploadGeoFile,
    deleteGeoFile,
    cleanupExtraGeoDat,
    cleanGeoSourcePayload,
    saveGeoSources,
    saveGeoPresetOverrides,
    addGeoSource,
    editGeoPreset,
    resetGeoPresetOverride,
    editGeoSource,
    cancelGeoSourceEdit,
    removeGeoSource,
    toggleGeoSourceEnabled,
    cleanGeoListPayload,
    saveGeoLists,
    addGeoList,
    editGeoList,
    cancelGeoListEdit,
    loadGeoCatalog,
    openGeoCatalogCategory,
    saveGeoCatalogCategory,
    removeGeoList,
    toggleGeoListEnabled
  };
}
