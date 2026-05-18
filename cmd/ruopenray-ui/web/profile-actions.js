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
    activateProfile,
    saveProfile,
    backup
  };
}
