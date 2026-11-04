import assert from 'node:assert/strict';
import test from 'node:test';
import { createSetupView } from '../cmd/ruopenray-ui/web/setup-view.js';
import { createSettingsView } from '../cmd/ruopenray-ui/web/settings-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

function coreState(patch = {}) {
  return {
    status: { core: { available: true, version: 'Xray 26.3.27' } },
    coreDialogOpen: true, coreReleaseFilter: 'stable', selectedCoreVersion: 'v26.10.31', coreBackup: true,
    coreReleases: [{ tag: 'v26.10.31', name: 'Stable release', assetUrl: 'https://example.test/xray.zip', publishedAt: '2026-10-31T00:00:00Z' }],
    coreArch: { goos: 'linux', goarch: 'arm64', packageArch: 'aarch64_cortex-a53', uname: 'aarch64', githubAsset: 'Xray-linux-arm64-v8a.zip' },
    ...patch,
  };
}

function renderCore(state) {
  return createSetupView({ state, shellQuote: String, escapeHtml, byteSize: String }).coreUpdateDialog();
}

const bannerTitle = (html) => html.match(/class="core-update-banner[^"]*"[^>]*>\s*<strong>([^<]+)<\/strong>/)?.[1];
const installButton = (html) => html.match(/<button[^>]*data-action="updateCore"[^>]*>/)?.[0];

for (const [patch, expected] of [
  [{ coreReleases: [], coreReleaseChecking: true }, 'Проверяю обновления Xray'],
  [{ coreReleases: [], coreReleasesError: 'GitHub unavailable' }, 'Не удалось проверить обновления'],
  [{ coreReleases: [] }, 'Нет доступного релиза для сравнения'],
  [{ coreReleases: [{ tag: 'v26.10.31', prerelease: false }] }, 'Нет доступного релиза для сравнения'],
  [{ status: { core: { available: true, version: 'unknown' } } }, 'Текущая версия Xray не определена'],
]) {
  test(`core updater explains ${expected} without claiming that the installed version is current`, () => {
    const state = coreState(patch);
    const before = structuredClone(state);
    const html = renderCore(state);
    assert.equal(bannerTitle(html), expected);
    assert.doesNotMatch(html, /Актуальная стабильная версия уже установлена/);
    assert.deepEqual(state, before);
  });
}

test('a selected release without an architecture asset cannot start installation', () => {
  const state = coreState({ coreReleases: [{ tag: 'v26.10.31', name: 'No matching architecture' }] });
  const html = renderCore(state);
  assert.match(html, /data-core-version="v26\.10\.31"[^>]*disabled/);
  assert.match(installButton(html), /disabled/);
  assert.match(html, /нет сборки/);
});

test('an available newer release can be installed, while the installed release is disabled', () => {
  assert.equal(bannerTitle(renderCore(coreState())), 'Есть обновление');
  assert.doesNotMatch(installButton(renderCore(coreState())), /disabled/);
  const installed = coreState({ status: { core: { available: true, version: 'Xray 26.10.31' } } });
  assert.equal(bannerTitle(renderCore(installed)), 'Стабильная версия актуальна');
  assert.match(installButton(renderCore(installed)), /disabled/);
});

test('selecting a newer prerelease does not turn the stable-channel status into a blanket no-update claim', () => {
  const state = coreState({ status: { core: { available: true, version: 'Xray 26.10.31' } }, coreReleaseFilter: 'pre', selectedCoreVersion: 'v26.11.4-pre',
    coreReleases: [{ tag: 'v26.10.31', assetUrl: 'stable' }, { tag: 'v26.11.4-pre', assetUrl: 'preview', prerelease: true }] });
  const html = renderCore(state);
  assert.equal(bannerTitle(html), 'Стабильная версия актуальна');
  assert.match(html, /Последний stable: v26\.10\.31/);
  assert.doesNotMatch(installButton(html), /disabled/);
  assert.doesNotMatch(html, /Обновление не требуется/);
});

test('an in-flight core update freezes its inputs while leaving the dialog close action available', () => {
  const state = coreState({ coreUpdating: true });
  const before = structuredClone(state);
  const html = renderCore(state);
  assert.match(html, /data-core-filter="stable"[^>]*disabled/);
  assert.match(html, /data-core-filter="pre"[^>]*disabled/);
  assert.match(html, /data-core-version="v26\.10\.31"[^>]*disabled/);
  assert.match(html, /id="coreBackup"[^>]*checked[^>]*disabled/);
  assert.match(installButton(html), /disabled/);
  assert.doesNotMatch(html.match(/<button[^>]*data-action="closeCoreDialog"[^>]*>/)[0], /disabled/);
  assert.deepEqual(state, before);
});

test('architecture and release text are complete and escaped in the themed dialog', () => {
  const state = coreState({ coreArch: { goos: 'linux', goarch: 'arm64', packageArch: 'aarch64_cortex-a53', uname: '<uname>', githubAsset: 'Xray-linux-arm64-v8a.zip' }, coreReleases: [{ tag: 'v26.10.31', name: '<release>', assetUrl: 'asset' }] });
  const html = renderCore(state);
  assert.match(html, /runtime: linux\/arm64/);
  assert.match(html, /пакет: aarch64_cortex-a53/);
  assert.match(html, /ядро: &lt;uname&gt;/);
  assert.match(html, /GitHub: Xray-linux-arm64-v8a\.zip/);
  assert.match(html, /&lt;release&gt;/);
  assert.doesNotMatch(html, /<release>|<uname>/);
});

test('the app updater has its own theme scope and preserves channel, backup and pending state', () => {
  const state = { settingsView: 'updates', status: { app: { version: '0.5.5' } }, appChannel: 'test', appBackup: true,
    appUpdating: true, appRelease: { tag: 'v0.5.6', update: true, assetUrl: 'asset', asset: 'linux-arm64' }, appUpdate: { state: 'pending', stdout: 'Проверяю процесс' } };
  const before = structuredClone(state);
  const html = createSettingsView({ state, escapeHtml, byteSize: String }).settingsPanel();
  assert.match(html, /class="panel settings-section settings-update-section"/);
  assert.match(html, /id="appChannel"[^>]*disabled/);
  assert.match(html, /<option value="test" selected/);
  assert.match(html, /id="appBackup"[^>]*checked/);
  assert.match(html, /<strong>Проверяю обновление<\/strong>/);
  assert.match(html, /data-action="updateApp"[^>]*disabled/);
  assert.deepEqual(state, before);
});
