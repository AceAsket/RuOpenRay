import assert from 'node:assert/strict';
import test from 'node:test';

import { createAmneziaActions } from '../cmd/ruopenray-ui/web/amnezia-actions.js';
import { createAmneziaView } from '../cmd/ruopenray-ui/web/amnezia-view.js';

const escapeHtml = (value) => String(value ?? '');

test('empty AmneziaWG page leads with one import action and hides technical noise', () => {
  const state = {
    amneziaView: 'profiles',
    amneziaStatus: {
      available: true,
      warnings: ['Для запуска нужен совместимый способ запуска.'],
      clientConfig: { exists: false, profiles: { items: [] } },
      runtime: {}
    }
  };

  const html = createAmneziaView({ state, escapeHtml }).amneziaPanel();
  assert.match(html, /Можно начать настройку/);
  assert.match(html, />Подключение<\/button>/);
  assert.match(html, />Диагностика<\/button>/);
  assert.equal((html.match(/data-action="openAmneziaImportDialog"/g) || []).length, 1);
  assert.match(html, /Импортировать client\.conf/);
  assert.doesNotMatch(html, /AWG-пул|Policy routing/);
  assert.match(html, /<details class="amnezia-warning-summary">/);
});

test('saved AmneziaWG profile shows a single check-and-start flow', () => {
  const profile = {
    id: 'home',
    name: 'Домашний AWG',
    active: true,
    selected: true,
    summary: 'vpn.example.com:51820',
    interface: { address: '10.8.0.2/32' },
    peer: { endpoint: 'vpn.example.com:51820', allowedIPs: '0.0.0.0/0' }
  };
  const state = {
    amneziaView: 'profiles',
    amneziaSelectedProfileIds: ['home'],
    amneziaPreflight: { ok: true, checks: [{ ok: true, label: 'Профиль' }], plan: ['Создать интерфейс.'] },
    amneziaStatus: {
      available: true,
      clientConfig: { exists: true, name: profile.name, profiles: { items: [profile], selectedIds: ['home'], mode: 'mixed' } },
      runtime: {},
      control: {}
    }
  };

  const html = createAmneziaView({ state, escapeHtml }).amneziaPanel();
  assert.match(html, /Проверить и запустить/);
  assert.match(html, /Для выбранных сайтов и устройств/);
  assert.match(html, /Сохранённые подключения/);
  assert.match(html, /Технический план запуска/);
  assert.doesNotMatch(html, /быстрые действия|Подготовить AWG/);
});

test('failed AmneziaWG readiness check keeps the tunnel stopped and explains the next step', () => {
  const profile = {
    id: 'home',
    name: 'Домашний AWG',
    active: true,
    interface: { address: '10.8.0.2/32' },
    peer: { endpoint: 'vpn.example.com:51820', allowedIPs: '0.0.0.0/0' }
  };
  const state = {
    amneziaView: 'profiles',
    amneziaPreflight: { ok: false, checks: [{ ok: false, label: 'Способ запуска' }] },
    amneziaStatus: {
      available: true,
      clientConfig: { exists: true, profiles: { items: [profile] } },
      runtime: {},
      control: {}
    }
  };

  const html = createAmneziaView({ state, escapeHtml }).amneziaPanel();
  assert.match(html, /Нужны исправления/);
  assert.match(html, /Откройте результаты проверки ниже/);
  assert.match(html, /amnezia-next-step warn/);
  assert.match(html, /Проверить и запустить/);
  assert.doesNotMatch(html, /Остановить туннель/);
});

test('running AmneziaWG state replaces launch actions with one stop action', () => {
  const profile = {
    id: 'home',
    name: 'Домашний AWG',
    active: true,
    interface: { address: '10.8.0.2/32' },
    peer: { endpoint: 'vpn.example.com:51820', allowedIPs: '0.0.0.0/0' }
  };
  const state = {
    amneziaView: 'profiles',
    amneziaPreflight: { ok: true, checks: [{ ok: true, label: 'Способ запуска' }] },
    amneziaStatus: {
      available: true,
      running: true,
      clientConfig: { exists: true, profiles: { items: [profile] } },
      runtime: { interfaceRunning: true, connected: true },
      control: { managed: true }
    }
  };

  const html = createAmneziaView({ state, escapeHtml }).amneziaPanel();
  assert.match(html, /Туннель работает/);
  assert.match(html, /Остановить туннель/);
  assert.doesNotMatch(html, /Проверить и запустить/);
});

test('check-and-start stops before mutation when readiness check fails', async () => {
  const calls = [];
  const state = { amneziaConfigText: '', amneziaProfileId: '', amneziaSelectedProfileIds: [] };
  const actions = createAmneziaActions({
    state,
    render() {},
    syncConfig() {},
    async request(url) {
      calls.push(url);
      return { ok: true, preflight: { ok: false, checks: [{ ok: false }] } };
    }
  });

  await actions.checkAndStartAmnezia();
  assert.deepEqual(calls, ['/api/amnezia/preflight']);
  assert.match(state.message, /Запуск отменён/);
});

test('check-and-start launches only after readiness check passes', async () => {
  const calls = [];
  const state = { amneziaConfigText: '', amneziaProfileId: '', amneziaSelectedProfileIds: [] };
  const actions = createAmneziaActions({
    state,
    render() {},
    syncConfig() {},
    async request(url) {
      calls.push(url);
      if (url === '/api/amnezia/preflight') return { ok: true, preflight: { ok: true, checks: [{ ok: true }] } };
      return { ok: true, status: { clientConfig: { profiles: { items: [] } }, runtime: {} }, message: 'Запущен' };
    }
  });

  await actions.checkAndStartAmnezia();
  assert.deepEqual(calls, ['/api/amnezia/preflight', '/api/amnezia/start']);
  assert.equal(state.message, 'Запущен');
});
