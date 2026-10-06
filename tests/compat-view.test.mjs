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
  return createCompatView({ state, escapeHtml, pageUrl: 'http://192.168.50.117:9090/' }).compatPanel();
}

test('Integrations explain the Xray, AWG and B4 roles as one safe scheme', () => {
  const html = renderCompat();
  assert.match(html, /Xray \+ AmneziaWG \+ B4/);
  assert.match(html, /Состояние компонентов/);
  assert.match(html, /Выбор маршрута/);
  assert.match(html, /Дополнительный выход/);
  assert.match(html, /DPI-обход direct/);
  assert.match(html, /Для B4 и AdGuard Home профиль AWG не нужен/);
  assert.match(html, /Порт 7000 занят/);
  assert.match(html, /Фильтрация DNS/);
  assert.match(html, /Технические сведения AdGuard Home/);
  assert.doesNotMatch(html, /Сторонние сервисы/);
  assert.doesNotMatch(html, /Podkop/i);
  assert.doesNotMatch(html, /v2rayA/i);
  assert.doesNotMatch(html, /Остановить RuOpenRay/);
});

test('Generic router policy tables do not make inactive B4 look active', () => {
  const html = renderCompat();
  assert.match(html, /B4 установлен, но активных следов не видно/);
  assert.match(html, /перехват не найден/);
  assert.match(html, /Проверить B4/);
  assert.doesNotMatch(html, /NFQUEUE активен/);
});

test('AdGuard is visible as a component with live filtering state and direct settings/admin links', () => {
  const status = { configured: true, ok: true, running: true, protectionEnabled: true, filteringEnabled: true, url: 'http://127.0.0.1:3001' };
  const card = (adguardStatus) => renderCompat({ adguardStatus }).match(/<article class="compat-flow-step[^]*?<\/article>/g)[3];
  const enabled = card(status);
  assert.match(enabled, /class="compat-flow-step ok"/);
  assert.match(enabled, /работает/);
  assert.match(enabled, /Фильтрация включена/);
  assert.match(enabled, /data-tab-jump="dns" data-dns-view-jump="adguard"/);
  assert.match(enabled, /href="http:\/\/192\.168\.50\.117:3001\/" target="_blank" rel="noopener noreferrer"/);
  for (const change of [{ protectionEnabled: false }, { filteringEnabled: false }, { running: false }]) {
    const disabled = card({ ...status, ...change });
    assert.match(disabled, /class="compat-flow-step warn"/);
    assert.match(disabled, /Фильтрация выключена/);
    assert.doesNotMatch(disabled, /Фильтрация включена/);
  }
  const failed = card({ ...status, ok: false, error: '<script>API unavailable</script>' });
  assert.match(failed, /API не отвечает/);
  assert.match(failed, /Фильтрация не проверена/);
  assert.doesNotMatch(failed, /<script>|Фильтрация включена/);
});

test('Detected service without API does not claim working filtering; missing service has no admin link', () => {
  const html = renderCompat({ compatStatus: { adguardHome: { available: true, running: true, dnsPath: 'doh-vpn' }, links: {} } });
  assert.match(html, /Фильтрация не проверена/);
  assert.match(html, /Направление выбирают правила Xray/);
  assert.match(html, /DoH → Xray/);
  assert.doesNotMatch(html, /Фильтрация включена/);
  const missing = renderCompat({ compatStatus: { adguardHome: {}, links: { adguardHome: 'http://192.168.50.117:3000/' } } });
  assert.doesNotMatch(missing, /Открыть AdGuard Home/);
  assert.match(missing, /data-dns-view-jump="adguard"/);
});

test('Integrations offer B4 only after Xray and AmneziaWG are ready', () => {
  const html = renderCompat({
    compatStatus: {
      links: {},
      adguardHome: {},
      amnezia: {
        available: true,
        running: true,
        runtime: { backendReady: true, interfaceRunning: true },
        clientConfig: { profiles: { items: [{ id: 'home' }], mode: 'mixed' } },
        xrayIntegration: { transparentReady: false },
      },
      b4: {
        available: true,
        active: false,
        running: false,
        config: { found: true },
        service: { exists: true, enabled: false },
        routing: { markConflict: false },
      },
    },
  });

  assert.match(html, /Осталось настроить B4/);
  assert.match(html, /Ограничьте B4 direct-трафиком и запустите/);
  assert.match(html, /Запустить B4/);
});

test('Integrations show a ready state when all three components are separated and active', () => {
  const html = renderCompat({
    compatStatus: {
      links: {},
      adguardHome: {},
      amnezia: {
        available: true,
        running: true,
        runtime: { backendReady: true, interfaceRunning: true },
        clientConfig: { profiles: { items: [{ id: 'home' }], mode: 'mixed' } },
        xrayIntegration: { transparentReady: false },
      },
      b4: {
        available: true,
        active: true,
        running: true,
        config: { found: true },
        service: { exists: true, enabled: true },
        api: { available: true, queueActive: true, config: { queueScope: 'direct' } },
        routing: { markConflict: false },
      },
    },
  });

  assert.match(html, /Компоненты работают совместно/);
  assert.match(html, /Компоненты работают без явного конфликта/);
  assert.doesNotMatch(html, /Запустить B4/);
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
  assert.match(html, /Совместный запуск заблокирован/);
});
