import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsView } from '../cmd/ruopenray-ui/web/settings-view.js';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const byteSize = (value) => `${Math.round(Number(value || 0) / 1024)} KB`;

function renderSettings(overrides = {}) {
  const state = {
    settingsView: 'overview',
    uiTheme: 'dark',
    status: {
      service: { running: true },
      core: { available: true, version: 'Xray 26.3.27' },
      app: { version: 'dev' },
      config: { path: '/etc/xray/config.json', routingRules: 12 },
    },
    appRelease: { update: true, assetUrl: 'https://example.test/app', tag: 'v0.5.0', asset: 'linux-arm64' },
    loggingLevel: 'warning',
    loggingAccessLog: true,
    loggingErrorLog: true,
    loggingDnsLog: false,
    loggingAccessPath: '/tmp/access.log',
    loggingErrorPath: '/tmp/error.log',
    loggingMaxSizeMb: '2',
    loggingRotateCopies: '1',
    loggingClearOnRestart: false,
    loggingRestart: true,
    loggingSettings: { accessSize: 2048, errorSize: 1024, maintenanceEvery: '15 мин' },
    storageReport: {
      disk: { free: 64 * 1024 * 1024, total: 128 * 1024 * 1024, usedPercent: '50%', path: '/overlay' },
      items: {
        backups: { size: 4096, count: 2, path: '/tmp/backups' },
        geoBase: { size: 8192, count: 2, path: '/usr/share/xray' },
        geoExtra: { size: 1024, count: 1, path: '/usr/share/xray-extra' },
        logs: { size: 3072, count: 2, path: '/tmp/logs' },
        packageCache: { size: 1024, count: 1, path: '/tmp/cache' },
        appBinary: { size: 16384, count: 1, path: '/usr/bin/ruopenray-ui' },
      },
      unusedDat: [],
    },
    config: { inbounds: [{ tag: 'socks-in', protocol: 'socks', listen: '127.0.0.1', port: 10808, settings: {} }] },
    ...overrides,
  };
  return createSettingsView({ state, byteSize, escapeHtml }).settingsPanel();
}

test('Settings open with a plain-language overview instead of technical logging', () => {
  const html = renderSettings();
  assert.match(html, /Основные настройки/);
  assert.match(html, /Xray и роутер/);
  assert.match(html, /Основное/);
  assert.match(html, /Дополнительно/);
  assert.doesNotMatch(html, /Для опытных/);
  assert.match(html, /data-settings-view="interface"/);
  assert.match(html, /Темная тема/);
  assert.match(html, /dev → v0\.5\.0/);
  assert.match(html, /1 включено/);
  assert.doesNotMatch(html, /id="loggingAccessPath"/);
});

test('Xray journal keeps file paths and rotation in a secondary disclosure', () => {
  const html = renderSettings({ settingsView: 'logging' });
  assert.match(html, /<h2>Журнал Xray<\/h2>/);
  assert.match(html, /data-details-key="settings-logging-maintenance"/);
  assert.match(html, /Хранение и применение/);
  assert.match(html, /id="loggingAccessPath"/);
  assert.match(html, /Сохранить/);
  assert.doesNotMatch(html, /<h2>Обслуживание логов<\/h2>/);
});

test('Storage keeps free space visible and moves path breakdown below details', () => {
  const html = renderSettings({ settingsView: 'storage' });
  assert.match(html, /<span>Свободно<\/span><strong>65536 KB<\/strong>/);
  assert.match(html, /data-details-key="settings-storage-breakdown"/);
  assert.match(html, /Что занимает место/);
  assert.match(html, /Очистить резервные копии/);
});
