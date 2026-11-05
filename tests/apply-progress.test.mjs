import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyOperationProgressView, applyStageProgressView, applyStageProgressVisible } from '../cmd/ruopenray-ui/web/apply-progress-view.js';
import { createDashboardView } from '../cmd/ruopenray-ui/web/dashboard-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

const steps = () => [
  { id: 'check-xray', label: 'Проверяю черновик Xray перед перезапуском', status: 'pending' },
  { id: 'apply-xray', label: 'Записываю конфигурацию и перезапускаю Xray', status: 'pending' },
  { id: 'apply-firewall', label: 'Применяю nftables без перезапуска Xray', status: 'pending' },
  { id: 'refresh', label: 'Обновляю состояние панели', status: 'pending' }
];
const count = (html, pattern) => [...html.matchAll(pattern)].length;
const appSource = readFileSync(new URL('../cmd/ruopenray-ui/web/app.js', import.meta.url), 'utf8');
const pendingSource = appSource.slice(appSource.indexOf('function pendingApplyProgressVisible() {'), appSource.indexOf('function setupStepOrder() {'));
const createPendingView = new Function('state', 'configHasUnappliedChanges', 'firewallHasUnappliedChanges', 'firewallPendingReasons', 'pendingXrayChangeItems', 'pendingApplyRisks', 'escapeHtml', 'applyStageProgressView', 'applyStageProgressVisible', `${pendingSource}\nreturn { pendingChangesBanner, pendingApplyProgressVisible, mainApplyFallbackVisible };`);

function fixture(overrides = {}, dirty = { config: true, firewall: true }) {
  const state = { tab: 'routing', busyAction: 'apply', configApplying: true, applySteps: steps(), ...overrides };
  const view = createPendingView(state, () => dirty.config, () => dirty.firewall, () => ['Изменена область перехвата'], () => ['Изменено правило'], () => [], escapeHtml, applyStageProgressView, applyStageProgressVisible);
  const dashboard = createDashboardView({ state, escapeHtml, proxyOutbounds: () => [], pendingApplyProgressVisible: view.pendingApplyProgressVisible, mainApplyFallbackVisible: view.mainApplyFallbackVisible });
  return { state, dirty, ...view, operationProgressView: dashboard.operationProgressView };
}

test('apply stages show the real running step, completed checks and pending numbers without mutating state', () => {
  const stages = steps();
  stages[0].status = 'done';
  stages[1].status = 'running';
  const before = structuredClone(stages);
  const html = applyStageProgressView(stages, escapeHtml);
  assert.match(html, /Шаг 2 из 4/);
  assert.match(html, /Записываю конфигурацию и перезапускаю Xray/);
  assert.equal(count(html, /class="apply-stage is-current"/g), 1);
  assert.equal(count(html, /aria-current="step"/g), 1);
  assert.match(html, /class="apply-stage-marker" aria-hidden="true">✓/);
  assert.match(html, /class="apply-stage-marker" aria-hidden="true">3/);
  assert.equal(count(html, /role="status"/g), 1);
  assert.doesNotMatch(html, /progressbar|aria-valuenow|\d+%|operation-progress/);
  assert.deepEqual(stages, before);
});

test('pending, complete and failed stage displays follow recorded statuses and escape labels', () => {
  const stages = steps();
  let html = applyStageProgressView(stages, escapeHtml);
  assert.match(html, /data-apply-phase="pending"/);
  assert.match(html, /Выполнено 0 из 4/);
  assert.doesNotMatch(html, /aria-current="step"|class="apply-stage is-current"/);
  stages.forEach((step) => { step.status = 'done'; });
  html = applyStageProgressView(stages, escapeHtml);
  assert.match(html, /Выполнено 4 из 4/);
  assert.match(html, /Этапы применения завершены/);
  assert.doesNotMatch(html, /aria-current="step"/);
  stages[2] = { id: 'apply-firewall', status: 'error', label: 'Ошибка <img src=x> "проверки"' };
  stages[3].status = 'pending';
  html = applyStageProgressView(stages, escapeHtml);
  assert.match(html, /data-apply-phase="error"/);
  assert.match(html, /Шаг 3 из 4/);
  assert.match(html, /Применение остановлено: Ошибка &lt;img src=x&gt; &quot;проверки&quot;/);
  assert.doesNotMatch(html, /<img|class="apply-stage is-current"/);
  assert.equal(count(html, /class="apply-stage is-error"/g), 1);
});

test('a failed apply shows the escaped cause next to retry controls and hides it outside error states', () => {
  const stages = steps();
  stages[0].status = 'error';
  const failure = { title: 'Xray отклонил сервер', body: 'Сервер <unsafe> без TLS', technical: 'failed <script>alert(1)</script>' };
  const html = applyStageProgressView(stages, escapeHtml, { failure });
  assert.match(html, /apply-stage-error/);
  assert.match(html, /Сервер &lt;unsafe&gt; без TLS/);
  assert.match(html, /Технические подробности/);
  assert.match(html, /failed &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<unsafe>/);
  stages[0].status = 'running';
  assert.doesNotMatch(applyStageProgressView(stages, escapeHtml, { failure }), /apply-stage-error/);
});

test('a failed apply rail belongs to the checked draft and disappears after editing it', () => {
  const state = { applySteps: [{ status: 'error' }], busyAction: '', jsonDraft: 'after', applyAttemptDraftText: 'before' };
  assert.equal(applyStageProgressVisible(state), false);
  state.jsonDraft = 'before';
  assert.equal(applyStageProgressVisible(state), true);
  state.jsonDraft = 'after';
  state.busyAction = 'apply';
  assert.equal(applyStageProgressVisible(state), true);
});

test('the main pending banner owns one announcer and suppresses the duplicate local apply animation', () => {
  const f = fixture();
  f.state.applySteps[0].status = 'running';
  const html = f.pendingChangesBanner();
  assert.equal(f.pendingApplyProgressVisible(), true);
  assert.equal(f.mainApplyFallbackVisible(), false);
  assert.equal(f.operationProgressView(), '');
  assert.equal(count(html, /role="status"/g), 1);
  assert.match(html, /<section class="pending-changes" aria-label="Применение изменений">/);
  assert.match(html, /<details class="pending-details">\s*<summary>Что изменится<\/summary>/);
  assert.ok(html.indexOf('class="pending-actions"') < html.indexOf('class="apply-stage-progress"'), 'the rail follows the existing header/details/actions cells');
  assert.match(html, /data-action="discardPendingChanges" disabled/);
  assert.match(html, /data-action="apply" disabled/);
  assert.doesNotMatch(html, /apply-step-list|operation-progress/);
});

test('active apply stages stay visible after the draft becomes clean and disappear after completion', () => {
  const f = fixture();
  f.dirty.config = false;
  f.dirty.firewall = false;
  f.state.configApplying = false;
  f.state.applySteps.forEach((step) => { step.status = 'done'; });
  assert.equal(f.pendingApplyProgressVisible(), true);
  assert.match(f.pendingChangesBanner(), /Выполнено 4 из 4/);
  assert.equal(f.operationProgressView(), '');
  f.state.busyAction = '';
  assert.equal(f.pendingApplyProgressVisible(), false);
  assert.equal(f.pendingChangesBanner(), '');
});

test('a retained failed step is reviewable and retry controls keep their existing unlocked state', () => {
  const f = fixture({ busyAction: '', configApplying: false });
  f.state.applySteps[0].status = 'error';
  const html = f.pendingChangesBanner();
  assert.match(html, /data-apply-phase="error"/);
  assert.doesNotMatch(html, /data-action="apply" disabled|data-action="discardPendingChanges" disabled/);
  assert.equal(count(html, /role="status"/g), 1);
  f.state.busyAction = 'check';
  assert.equal(f.pendingApplyProgressVisible(), false, 'a different operation does not revive a stale apply rail');
});

test('a terminal error rail does not repeat the global final-result announcement', () => {
  const f = fixture({ busyAction: '', configApplying: false, message: 'Не удалось применить конфигурацию' });
  f.state.applySteps[0].status = 'error';
  const html = f.pendingChangesBanner();
  assert.match(html, /data-apply-phase="error"/);
  assert.doesNotMatch(html, /role="status"|aria-live=/);
  assert.match(html, /data-action="apply"/);
});

for (const tab of ['dashboard', 'servers', 'setup']) {
  test(`direct no-dirty apply has one compact operation fallback on ${tab}`, () => {
    const f = fixture({ tab, busyAction: 'connect', configApplying: true, busyLabel: 'Подключаю <пример>', applySteps: [] }, { config: false, firewall: false });
    assert.equal(f.pendingChangesBanner(), '');
    assert.equal(f.pendingApplyProgressVisible(), false);
    assert.equal(f.mainApplyFallbackVisible(), true);
    assert.equal(f.operationProgressView(), '', 'the component does not duplicate the global fallback');
    const html = f.operationProgressView({ globalFallback: true });
    assert.match(html, /class="apply-stage-progress apply-stage-fallback"/);
    assert.match(html, /Подключаю &lt;пример&gt;/);
    assert.equal(count(html, /role="status"/g), 1);
    assert.doesNotMatch(html, /<пример>|apply-stage-list|Шаг \d|из \d|aria-valuenow|operation-progress/);
  });
}

test('firewall-only fallback and unrelated configuration checks remain available', () => {
  const f = fixture({ tab: 'routing', busyAction: '', configApplying: false, firewallSaving: true, applySteps: [] }, { config: false, firewall: false });
  assert.match(f.operationProgressView({ globalFallback: true }), /Записываю nftables/);
  f.state.firewallSaving = false;
  f.state.configTesting = true;
  assert.equal(f.mainApplyFallbackVisible(), false);
  assert.match(f.operationProgressView(), /operation-progress check-progress/);
  assert.equal(applyStageProgressView([], escapeHtml), '');
  assert.equal(applyStageProgressVisible({ applySteps: [], busyAction: 'apply' }), false);
  assert.doesNotMatch(applyOperationProgressView('Применяю настройки', escapeHtml), /Шаг \d|из \d/);
});
