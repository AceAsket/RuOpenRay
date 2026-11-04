import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';
import { noticeDialogOwner, noticeView } from '../cmd/ruopenray-ui/web/notice-view.js';
import { tabTitles } from '../cmd/ruopenray-ui/web/presets.js';
import { bindActionControls } from '../cmd/ruopenray-ui/web/action-bindings.js';
import { balancerMonitorForm } from '../cmd/ruopenray-ui/web/balancer-policy.js';
import { createImportActions } from '../cmd/ruopenray-ui/web/import-actions.js';
import { createImportDialogView } from '../cmd/ruopenray-ui/web/import-dialog-view.js';
import { createRouteBalancerActions } from '../cmd/ruopenray-ui/web/route-balancer-actions.js';
import { createRoutingActions } from '../cmd/ruopenray-ui/web/routing-actions.js';
import { createRoutingDialogsView } from '../cmd/ruopenray-ui/web/routing-dialogs-view.js';
import { createAmneziaView } from '../cmd/ruopenray-ui/web/amnezia-view.js';
import { createAuxPanelsView } from '../cmd/ruopenray-ui/web/aux-panels-view.js';
import { createProfileActions } from '../cmd/ruopenray-ui/web/profile-actions.js';

const web = new URL('../cmd/ruopenray-ui/web/', import.meta.url);
const appSource = readFileSync(new URL('app.js', web), 'utf8');
const mainContentSource = appSource.slice(appSource.indexOf('function mainPageContent('), appSource.indexOf('function pendingApplyProgressVisible()'));
const createMainContent = new Function('state', 'noticeView', 'noticeDialogOwner', 'escapeHtml', 'pendingChangesBanner', 'operationProgressView', 'content', `${mainContentSource}\nreturn mainPageContent;`);
const count = (html, pattern) => [...html.matchAll(pattern)].length;

function fixture(state) {
  return createMainContent(state, noticeView, noticeDialogOwner, escapeHtml,
    () => '<section data-marker="pending">Несохранённые изменения</section>',
    () => '<section data-marker="operation" role="status">Текущая операция</section>',
    () => '<section data-marker="content"><p class="inline-error">Контекстная ошибка формы</p></section>');
}

const splitValues = (value) => String(value || '').split(/[\n,]+/).map((part) => part.trim()).filter(Boolean);

function routingDialogs(state) {
  return createRoutingDialogsView({ state, escapeHtml, routeBalancers: () => [], routeRules: () => state.config.routing.rules,
    balancerTargetOptions: () => state.config.outbounds.map(({ tag }) => ({ tag, title: tag })),
    splitRouteValues: splitValues, balancerSelectorMatches: () => [], strategyObserverType: () => '',
    routeTargetOptions: () => [], balancerOptions: () => [], customRoutePresetEntries: () => [], builtinRoutePresetEntries: () => [],
    routeKinds: {}, routePlaceholders: {}, routeLeasePicker: () => '', dslPreviewView: () => '', routePresetCheckResultView: () => '',
  });
}

test('every page places one global result before pending changes and its content', () => {
  for (const tab of Object.keys(tabTitles)) {
    const state = { tab, message: 'Проверка завершена: обновлений нет' };
    const before = structuredClone(state);
    const html = fixture(state)({ hasApplySteps: false, hasApplyFallback: false });
    assert.equal(count(html, /class="notice page-result-notice"/g), 1, tab);
    assert.equal(count(html, /Проверка завершена: обновлений нет/g), 1, tab);
    assert.equal(count(html, /role="status"/g), 1, tab);
    assert.ok(html.indexOf('page-result-notice') < html.indexOf('data-marker="content"'), tab);
    if (tab === 'setup') assert.doesNotMatch(html, /data-marker="pending"/);
    else assert.ok(html.indexOf('page-result-notice') < html.indexOf('data-marker="pending"'), tab);
    assert.match(html, /Контекстная ошибка формы/);
    assert.deepEqual(state, before);
  }
});

test('the global boundary escapes results and details while repairing only known display labels', () => {
  const tag = '????de_example_vpn';
  const message = `outbound "${tag}": invalid <example>`;
  const state = { tab: 'dashboard', config: { outbounds: [{ tag }] }, message,
    messageDetails: { forMessage: message, title: 'Проверка <Xray>', body: message, technical: 'Параметр <invalid>' }
  };
  const before = structuredClone(state);
  const html = fixture(state)({ hasApplySteps: false, hasApplyFallback: false });
  assert.match(html, /outbound &quot;de_example_vpn&quot;: invalid &lt;example&gt;/);
  assert.match(html, /Проверка &lt;Xray&gt;/);
  assert.match(html, /<pre>Параметр &lt;invalid&gt;<\/pre>/);
  assert.doesNotMatch(html, /\?{4}|<example>|<invalid>|<Xray>/);
  assert.equal(count(html, /class="notice page-result-notice"/g), 1);
  assert.deepEqual(state, before);
});

test('active apply progress owns its announcement and the final result returns above the content', () => {
  const state = { tab: 'routing', busyAction: 'apply', message: 'Применяю настройки' };
  const render = fixture(state);
  let html = render({ hasApplySteps: true, hasApplyFallback: false });
  assert.doesNotMatch(html, /page-result-notice|Применяю настройки/);
  assert.match(html, /Контекстная ошибка формы/);
  html = render({ hasApplySteps: false, hasApplyFallback: true });
  assert.doesNotMatch(html, /page-result-notice/);
  assert.equal(count(html, /role="status"/g), 1);
  state.busyAction = '';
  state.message = 'Применение не удалось: проверьте конфигурацию';
  html = render({ hasApplySteps: true, hasApplyFallback: false });
  assert.equal(count(html, /class="notice page-result-notice"/g), 1);
  assert.match(html, /Применение не удалось/);
  assert.ok(html.indexOf('page-result-notice') < html.indexOf('data-marker="pending"'));
  state.message = '';
  assert.doesNotMatch(render({ hasApplySteps: false, hasApplyFallback: false }), /page-result-notice/);
});

test('the authenticated shell mounts results directly after its topbar and page factories do not duplicate them', () => {
  assert.match(appSource, /<\/header>\s*\$\{mainPageContent\(\{ hasApplySteps, hasApplyFallback \}\)\}/);
  assert.equal(count(appSource, /\$\{mainPageContent\(/g), 1);
  for (const name of readdirSync(web).filter((name) => name.endsWith('-view.js') && !['notice-view.js', 'login-view.js'].includes(name))) {
    assert.doesNotMatch(readFileSync(new URL(name, web), 'utf8'), /state\.message\b|noticeView\(state\b/, `${name} delegates the shared message to the shell`);
  }
  assert.match(readFileSync(new URL('login-view.js', web), 'utf8'), /state\.message/, 'login keeps its own result because it has no authenticated topbar');
});

test('invalid balancer feedback stays visible inside its dialog once and raw routing tags are preserved on save', () => {
  const rawTag = '????de_example_vpn';
  const config = { outbounds: [{ tag: rawTag }, { tag: 'example-backup' }], routing: { rules: [{ outboundTag: rawTag }] } };
  const state = { ...balancerMonitorForm(config), tab: 'routing', config, routeBalancerDialog: true,
    routeBalancerEditingIndex: -1, routeBalancerTag: 'example-group', routeBalancerMode: 'failover',
    routeBalancerPrimary: rawTag, routeBalancerFallback: rawTag, routeBalancerSelectors: rawTag };
  const before = structuredClone(config);
  let saves = 0;
  const actions = createRouteBalancerActions({ state, render() {}, routeBalancers: () => state.config.routing.balancers || [],
    routeRules: () => state.config.routing.rules, splitRouteValues: splitValues,
    balancerTargetOptions: () => state.config.outbounds, syncConfig(next) { saves++; state.config = next; } });
  actions.saveRouteBalancer();
  assert.equal(state.routeBalancerDialog, true);
  assert.equal(saves, 0);
  assert.deepEqual(config, before);
  const html = routingDialogs(state).routeBalancerDialog();
  assert.equal(count(html, /modal-result-notice/g), 1);
  assert.match(html, /Выберите отдельный резервный VPN-сервер/);
  assert.equal(count(html, /role="status"/g), 1);
  assert.ok(html.indexOf('modal-result-notice') < html.indexOf('class="balancer-layout'));
  assert.doesNotMatch(fixture(state)({ hasApplySteps: false, hasApplyFallback: false }), /page-result-notice/);
  assert.ok(html.includes(`value="${rawTag}" selected`));
  state.routeBalancerFallback = 'example-backup';
  actions.saveRouteBalancer();
  assert.equal(saves, 1);
  assert.equal(state.routeBalancerDialog, false);
  assert.equal(state.config.routing.balancers[0].selector[0], rawTag);
  assert.equal(state.config.routing.rules[0].outboundTag, rawTag);
  assert.match(fixture(state)({ hasApplySteps: false, hasApplyFallback: false }), /class="notice page-result-notice"/);
});

test('a blank selected-group title reports in the open dialog without changing its selected rules', () => {
  const rawTag = '????de_example_vpn';
  const state = { tab: 'routing', routeGroupDialog: true, routeGroupTitle: '   ', selectedRouteRuleIndexes: [0, 1],
    config: { outbounds: [{ tag: rawTag }], routing: { rules: [{ outboundTag: rawTag, domain: ['domain:example.test'] }, { outboundTag: rawTag, port: '443' }] } } };
  const before = structuredClone(state.config);
  let saves = 0;
  const actions = createRoutingActions({ state, render() {}, routeRules: () => state.config.routing.rules,
    isRuOpenRayManagedRoute: () => false, setRoutingDraft() { saves++; } });
  actions.createSelectedRouteGroup();
  assert.equal(saves, 0);
  assert.equal(state.routeGroupDialog, true);
  assert.deepEqual(state.config, before);
  assert.deepEqual(state.selectedRouteRuleIndexes, [0, 1]);
  const html = routingDialogs(state).selectedRouteGroupDialog();
  assert.equal(count(html, /modal-result-notice/g), 1);
  assert.match(html, /Укажите название группы правил/);
  assert.doesNotMatch(fixture(state)({ hasApplySteps: false, hasApplyFallback: false }), /page-result-notice/);
});

test('an import request failure uses the same single visible modal boundary and retains its exact API input', async (t) => {
  const rawTag = '????de_example_vpn';
  const state = { tab: 'servers', importDialog: 'server', importLink: 'synthetic invalid import input', importOutboundTag: rawTag,
    config: { outbounds: [{ tag: rawTag }] }, message: '' };
  const before = structuredClone(state.config);
  const calls = [];
  const actions = createImportActions({ state, render() {}, request: async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) });
    throw new Error(`outbound "${rawTag}": invalid <example>`);
  } });
  let click;
  const button = { dataset: { action: 'previewImport' }, textContent: 'Распознать', classList: { contains: () => false }, addEventListener(type, listener) { if (type === 'click') click = listener; } };
  const previousDocument = globalThis.document;
  globalThis.document = { querySelectorAll: () => [button] };
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  bindActionControls({ state, render() {}, handlers: { previewImport: actions.previewImport } });
  await click({ target: button });
  assert.deepEqual(calls, [{ path: '/api/import/preview', body: { link: state.importLink, outboundTag: rawTag } }]);
  assert.equal(state.importDialog, 'server');
  assert.deepEqual(state.config, before);
  assert.match(state.message, /\?{4}/, 'the raw API error remains unchanged in state');
  const html = createImportDialogView({ state, escapeHtml, serverImportPreviewItem: () => null }).importDialog('server');
  assert.equal(count(html, /modal-result-notice/g), 1);
  assert.match(html, /outbound &quot;de_example_vpn&quot;: invalid &lt;example&gt;/);
  assert.ok(html.includes(`id="importOutboundTag" placeholder="Пусто = имя из ссылки" value="${rawTag}"`));
  assert.doesNotMatch(fixture(state)({ hasApplySteps: false, hasApplyFallback: false }), /page-result-notice/);
});

test('nested dialogs assign their shared notice only to the last visible overlay', () => {
  const state = { tab: 'routing', routeRuleDialog: true, routeRuleMode: 'single', selectedRoutePresets: [], routeRuleEditingIndex: -1,
    routeKind: 'domain', routePresetDialog: true, routePresetEditor: 'example', routePresetEditTitle: '', message: 'Введите название подборки',
    config: { outbounds: [], routing: { rules: [] } } };
  assert.equal(noticeDialogOwner(state), 'routePreset');
  const views = routingDialogs(state);
  const html = views.routeRuleDialog() + views.routePresetDialog() + fixture(state)({ hasApplySteps: false, hasApplyFallback: false });
  assert.equal(count(html, /modal-result-notice/g), 1);
  assert.ok(html.indexOf('class="modal preset-dialog"') < html.indexOf('modal-result-notice'));
  assert.equal(count(html, /Введите название подборки/g), 1);
  state.routePresetDialog = false;
  assert.equal(noticeDialogOwner(state), 'routeRule');
  state.routeRuleDialog = false;
  assert.equal(noticeDialogOwner(state), '');
  assert.match(fixture(state)({ hasApplySteps: false, hasApplyFallback: false }), /Введите название подборки/);
});

test('invalid profile JSON remains in its editor with one visible validation notice', async () => {
  const state = { tab: 'profiles', profileEditorOpen: true, profileEditName: 'example', profileEditDraft: '{invalid synthetic JSON', profiles: [] };
  let requests = 0;
  await createProfileActions({ state, render() {}, request: async () => { requests++; } }).saveProfileEditor();
  assert.equal(requests, 0);
  assert.equal(state.profileEditorOpen, true);
  assert.equal(state.profileEditDraft, '{invalid synthetic JSON');
  const html = createAuxPanelsView({ state, escapeHtml, labels: {}, stat: () => '' }).profilesPanel();
  assert.equal(count(html, /modal-result-notice/g), 1);
  assert.match(html, /JSON профиля не читается/);
  assert.ok(html.indexOf('class="modal profile-edit-dialog"') < html.indexOf('modal-result-notice'));
  assert.doesNotMatch(fixture(state)({ hasApplySteps: false, hasApplyFallback: false }), /page-result-notice/);
});

test('Amnezia import feedback is visible while hidden flags from other pages do not own results', () => {
  const state = { tab: 'amnezia', amneziaImportDialog: true, message: 'Не удалось сохранить конфиг <example>' };
  const html = createAmneziaView({ state, escapeHtml }).amneziaPanel();
  assert.equal(count(html, /modal-result-notice/g), 1);
  assert.match(html, /Не удалось сохранить конфиг &lt;example&gt;/);
  assert.equal(noticeDialogOwner(state), 'amneziaImport');
  assert.doesNotMatch(fixture(state)({ hasApplySteps: false, hasApplyFallback: false }), /page-result-notice/);
  state.tab = 'dashboard';
  state.serverEditDialog = true;
  state.profileEditorOpen = true;
  assert.equal(noticeDialogOwner(state), '');
  assert.match(fixture(state)({ hasApplySteps: false, hasApplyFallback: false }), /Не удалось сохранить конфиг/);
});
