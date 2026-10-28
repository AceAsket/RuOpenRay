import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiagnosticsView } from '../cmd/ruopenray-ui/web/diagnostics-view.js';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function renderDiagnostics(overrides = {}) {
  const state = {
    serverChecks: { first: { ok: true }, second: { ok: true } },
    diagnosticsView: '',
    diagnosticsChainResult: null,
    diagnosticsChainRunning: false,
    diagnosticsTestUrl: 'https://www.gstatic.com/generate_204',
    clientTrafficBaseline: null,
    clientTrafficResult: null,
    clientTrafficUrl: 'https://www.gstatic.com/generate_204',
    busyAction: '',
    ...overrides,
  };
  return createDiagnosticsView({
    byteSize: (value) => `${value || 0} B`,
    deviceRules: () => [],
    domainDiagnosticRows: () => [],
    escapeHtml,
    logsPanel: () => '<section class="log-panel">Журнал</section>',
    sniPanel: () => '<section class="sni-panel">SNI</section>',
    stat: () => '',
    state,
  }).diagnosticsPanel();
}

test('Diagnostics opens with the simple connection check', () => {
  const html = renderDiagnostics();
  assert.match(html, /Проверка работы RuOpenRay/);
  assert.match(html, /class="active" data-diagnostics-view="chain">Проверка/);
  assert.ok(html.indexOf('data-diagnostics-view="chain"') < html.indexOf('data-diagnostics-view="live"'));
  assert.doesNotMatch(html, /class="stats route-stats"/);
  assert.match(html, /Запустить проверку/);
  assert.match(html, /data-details-key="diagnostics-chain-options"/);
  assert.match(html, /data-details-key="diagnostics-client-test"/);
  assert.doesNotMatch(html, /Нажмите проверку: результат появится здесь/);
});

test('Diagnostics keeps passed steps collapsed and problems visible', () => {
  const html = renderDiagnostics({
    diagnosticsView: 'chain',
    diagnosticsChainResult: {
      steps: [
        { ok: true, title: 'Конфигурация Xray', detail: 'Configuration OK' },
        { ok: false, tone: 'warn', title: 'Статистика Xray', detail: 'учет трафика выключен' },
        { ok: false, title: 'LAN DNS', detail: 'серверы не заданы' },
      ],
    },
  });
  assert.match(html, /Ошибки в цепочке: 1/);
  assert.match(html, /Что проверить/);
  assert.match(html, /data-details-key="diagnostics-chain-results"/);
  assert.ok(html.indexOf('Конфигурация Xray') > html.indexOf('data-details-key="diagnostics-chain-results"'));
});
