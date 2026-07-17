import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompatView } from '../cmd/ruopenray-ui/web/compat-view.js';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function renderCompat(overrides = {}) {
  const state = {
    busyAction: '',
    status: {
      service: { running: true },
      config: { routingRules: 64 },
    },
    compatStatus: {
      routerLan: '192.168.50.1',
      links: { adguardHome: 'http://192.168.50.1:3000/', b4: '' },
      adguardHome: { available: true, running: false, usesXray: false },
      amnezia: {
        available: true,
        running: false,
        runtime: { backendReady: true },
        clientConfig: { profiles: { items: [], mode: 'standby' } },
        xrayIntegration: { transparentReady: true },
      },
      b4: {
        available: true,
        active: false,
        running: false,
        config: { found: true, paths: ['/etc/b4/b4.json'] },
        service: { exists: true, enabled: false },
        api: { available: false, queueActive: false },
        nft: { hasQueue: false },
        iptables: { hasNFQUEUE: false },
        routing: { policyRule: true, policyRoute: true, explicitB4: false, markConflict: false },
        ports: { occupied: true, ui: false },
        summary: 'B4 установлен, но активных следов не видно',
      },
    },
    ...overrides,
  };
  return createCompatView({ state, escapeHtml }).compatPanel();
}

test('Integrations explain the Xray, AWG and B4 roles as one safe scheme', () => {
  const html = renderCompat();
  assert.match(html, /Xray \+ AmneziaWG \+ B4/);
  assert.match(html, /Рекомендуемая схема/);
  assert.match(html, /Выбор маршрута/);
  assert.match(html, /Дополнительный выход/);
  assert.match(html, /DPI-обход direct/);
  assert.match(html, /Явных конфликтов не найдено/);
  assert.match(html, /Порт 7000 занят/);
  assert.match(html, /DNS рядом с RuOpenRay/);
  assert.doesNotMatch(html, /Сторонние сервисы/);
  assert.doesNotMatch(html, /Podkop/i);
  assert.doesNotMatch(html, /v2rayA/i);
  assert.doesNotMatch(html, /Остановить RuOpenRay/);
});

test('Generic router policy tables do not make inactive B4 look active', () => {
  const html = renderCompat();
  assert.match(html, /B4 установлен, но активных следов не видно/);
  assert.match(html, /перехват не найден/);
  assert.match(html, /Запустить B4/);
  assert.doesNotMatch(html, /NFQUEUE активен/);
});

test('Integrations surface mark and all-interface queue conflicts', () => {
  const state = {
    busyAction: '',
    status: { service: { running: true }, config: { routingRules: 10 } },
    compatStatus: {
      links: {},
      adguardHome: {},
      amnezia: { available: true, running: true, runtime: { backendReady: true }, xrayIntegration: { transparentReady: true }, clientConfig: { profiles: { items: [{}], mode: 'amnezia-first' } } },
      b4: {
        available: true,
        active: true,
        running: true,
        service: { exists: true, enabled: true },
        api: { available: true, queueActive: true, config: { queueScope: 'all', queue: { mark: 82 } } },
        routing: { markConflict: true, ruopenrayAWGMark: '0x52000000' },
      },
    },
  };
  const html = renderCompat(state);
  assert.match(html, /Есть конфликт перед параллельным запуском/);
  assert.match(html, /одинаковую fwmark 0x52000000/);
  assert.match(html, /B4 настроен на все интерфейсы/);
  assert.match(html, /Остановить B4/);
});
