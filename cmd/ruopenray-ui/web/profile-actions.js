import { anonymizeConfig } from './config-actions.js';

export function createProfileActions({
  state,
  request,
  render,
  refresh
}) {
  async function activateProfile(name) {
    await request('/api/profiles/activate', { method: 'POST', body: JSON.stringify({ name }) });
    state.message = `Активирован профиль ${name}`;
    await refresh();
  }

  async function loadProfileConfig(name) {
    return await request(`/api/profiles/get?name=${encodeURIComponent(name)}`);
  }

  async function openProfileEditor(name) {
    const result = await loadProfileConfig(name);
    state.profileEditorOpen = true;
    state.profileEditName = result.name || name;
    state.profileEditOriginalName = result.name || name;
    state.profileEditDraft = JSON.stringify(result.config || {}, null, 2);
    render();
  }

  function closeProfileEditor() {
    state.profileEditorOpen = false;
    state.profileEditName = '';
    state.profileEditOriginalName = '';
    state.profileEditDraft = '';
    render();
  }

  async function saveProfileEditor() {
    const name = String(state.profileEditName || '').trim();
    if (!name) {
      state.message = 'Введите имя профиля';
      render();
      return;
    }
    let config;
    try {
      config = JSON.parse(state.profileEditDraft || '{}');
    } catch (error) {
      state.message = `JSON профиля не читается: ${error.message}`;
      render();
      return;
    }
    await request('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name, config })
    });
    const oldName = String(state.profileEditOriginalName || '').trim();
    if (oldName && oldName !== name) {
      await request('/api/profiles/delete', {
        method: 'POST',
        body: JSON.stringify({ name: oldName })
      }).catch(() => null);
    }
    state.message = `Профиль ${name} сохранен`;
    closeProfileEditor();
    await refresh();
  }

  async function deleteProfile(name) {
    const profile = (state.profiles || []).find((item) => item.name === name);
    const suffix = profile?.active ? ' Активная конфигурация Xray останется загруженной, удалится только сохраненный JSON профиля.' : '';
    if (!confirm(`Удалить профиль ${name}?${suffix}`)) return;
    await request('/api/profiles/delete', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    state.message = `Профиль ${name} удален`;
    await refresh();
  }

  async function downloadProfile(name, { anonymized = false } = {}) {
    const result = await loadProfileConfig(name);
    const profileName = result.name || name;
    const filename = anonymized ? `${profileName}-anonymized.json` : `${profileName}.json`;
    const payload = anonymized ? anonymizeConfig(result.config || {}) : (result.config || {});
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (anonymized) {
      state.message = `Обезличенный профиль ${filename} скачан для диагностики`;
      render();
      return;
    }
    state.message = `Профиль ${filename} скачан`;
    render();
  }

  async function createProfileFromCurrent() {
    const name = String(state.profileCreateName || '').trim();
    if (!name) {
      state.message = 'Введите имя нового профиля';
      render();
      return;
    }
    const result = await request('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    const savedName = result.profile || name;
    state.profileCreateName = '';
    state.message = `Текущая конфигурация сохранена как профиль ${savedName}`;
    await refresh();
  }

  async function saveProfile() {
    const name = prompt('Имя профиля', 'custom');
    if (!name) return;
    await request('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ name, config: JSON.parse(state.jsonDraft) })
    });
    state.message = `Профиль ${name} сохранен`;
    await refresh();
  }

  async function backup() {
    const result = await request('/api/backup', { method: 'POST', body: '{}' });
    state.message = `Резервная копия создана: ${result.path}`;
    render();
  }

  return {
    createFullBackup: async () => {
      state.fullBackupResult = null;
      const result = await request('/api/backup/full', { method: 'POST', body: '{}' });
      if (!result.ok) throw new Error(result.error || 'Не удалось создать архив');
      state.fullBackupPath = result.path;
      state.fullBackupResult = await request('/api/backup/full/check', { method: 'POST', body: JSON.stringify({ path: result.path }) });
      state.message = state.fullBackupResult.ok ? `Полная копия создана и проверена: ${result.path}` : 'Копия создана, но проверка не пройдена';
      render();
    },
    checkFullBackup: async () => {
      state.fullBackupResult = await request('/api/backup/full/check', { method: 'POST', body: JSON.stringify({ path: state.fullBackupPath }) });
      state.message = state.fullBackupResult.ok ? 'Архив прошёл проверку целостности и конфигурации Xray' : (state.fullBackupResult.error || 'Проверка архива не пройдена');
      render();
    },
    activateProfile,
    openProfileEditor,
    closeProfileEditor,
    saveProfileEditor,
    deleteProfile,
    downloadProfile,
    createProfileFromCurrent,
    saveProfile,
    backup
  };
}
