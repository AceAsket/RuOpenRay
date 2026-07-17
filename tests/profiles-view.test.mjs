import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuxPanelsView } from '../cmd/ruopenray-ui/web/aux-panels-view.js';
import { createProfileActions } from '../cmd/ruopenray-ui/web/profile-actions.js';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function renderProfiles(overrides = {}) {
  const state = {
    profiles: [
      { name: 'default', active: true, size: 4096, updatedAt: '2026-07-17T08:00:00Z' },
      { name: 'work', active: false, size: 2048, updatedAt: '2026-07-16T08:00:00Z' },
    ],
    profileCreateName: '',
    profileEditorOpen: false,
    ...overrides,
  };
  return createAuxPanelsView({
    state,
    labels: { active: 'Активный', stored: 'Сохранён' },
    escapeHtml,
    stat: () => '',
    deviceRules: () => [],
    deviceStats: () => ({ proxy: 0, direct: 0, block: 0, other: 0 }),
    outboundOptions: () => [],
    leaseSearchText: () => '',
    formatDuration: () => '',
    leaseByIp: () => null,
  }).profilesPanel();
}

test('Profiles show the active configuration and keep secondary actions compact', () => {
  const html = renderProfiles();
  assert.match(html, /Активный профиль/);
  assert.match(html, /<h2>default<\/h2>/);
  assert.match(html, /Сохранить текущую конфигурацию как новый профиль/);
  assert.match(html, /id="profileCreateName"/);
  assert.match(html, /data-action="createProfileFromCurrent"/);
  assert.match(html, /class="profile-config-card"/);
  assert.match(html, /data-profile="work">Выбрать/);
  assert.match(html, /data-details-key="profile-more-work"/);
  assert.match(html, /data-details-key="profile-backups"/);
  assert.doesNotMatch(html, /class="table profile-table"/);
});

test('Profiles explain how to save an unsaved active configuration', () => {
  const html = renderProfiles({ profiles: [] });
  assert.match(html, /Активный профиль/);
  assert.match(html, /Не сохранён/);
  assert.match(html, /Других профилей пока нет/);
});

test('Creating a profile snapshots the current configuration without exposing JSON', async () => {
  const state = { profileCreateName: 'home-copy', message: '' };
  let payload = null;
  let refreshed = false;
  const actions = createProfileActions({
    state,
    request: async (path, options) => {
      assert.equal(path, '/api/profiles');
      payload = JSON.parse(options.body);
      return { ok: true, profile: 'home-copy' };
    },
    render: () => {},
    refresh: async () => { refreshed = true; },
  });
  await actions.createProfileFromCurrent();
  assert.deepEqual(payload, { name: 'home-copy' });
  assert.equal(state.profileCreateName, '');
  assert.equal(refreshed, true);
  assert.match(state.message, /home-copy/);
});
