import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileActions } from '../cmd/ruopenray-ui/web/profile-actions.js';
import { bindProfileControls } from '../cmd/ruopenray-ui/web/profile-bindings.js';
import { createConfigStateHelpers } from '../cmd/ruopenray-ui/web/config-state.js';

test('applying a profile restarts Xray and preserves a different local draft with an explicit notice', async () => {
  const local = { remark: 'my pending draft' };
  const active = { remark: 'profile selected' };
  const state = { config: local, jsonDraft: JSON.stringify(local, null, 2), appliedConfigText: '{}', activeConfigRevision: 'before', serverDraftRevision: 'my-draft' };
  const { syncConfig } = createConfigStateHelpers(state);
  let payload;
  const actions = createProfileActions({
    state, render: () => {},
    request: async (path, options) => {
      assert.equal(path, '/api/profiles/activate');
      payload = JSON.parse(options.body);
      return { ok: true, restart: { ok: true }, restartRequired: false, activeRevision: 'after', backup: '/backup/profile.json' };
    },
    refresh: async () => syncConfig(local, { fromServer: true, activeConfig: active, serverDraft: { exists: true, revision: 'my-draft', activeRevision: 'after' } }),
  });
  await actions.activateProfile('work');
  assert.deepEqual(payload, { name: 'work', restart: true, expectedConfigRevision: 'before' });
  assert.equal(state.config, local);
  assert.equal(state.jsonDraft, JSON.stringify(local, null, 2));
  assert.equal(state.appliedConfigText, JSON.stringify(active, null, 2));
  assert.equal(state.activeConfigRevision, 'after');
  assert.equal(state.activeConfigConflict, false);
  assert.equal(state.serverDraftRevision, 'my-draft');
  assert.match(state.message, /применён, Xray перезапущен/);
  assert.match(state.message, /черновик сохранён и остаётся неприменённым/);
});

test('older backend requiring restart is never described as an applied profile', async () => {
  const state = {};
  const actions = createProfileActions({ state, render: () => {}, refresh: async () => {}, request: async () => ({ ok: true, restartRequired: true }) });
  await actions.activateProfile('work');
  assert.match(state.message, /Для применения перезапустите Xray/);
  assert.doesNotMatch(state.message, /применён|Активирован/);
});

test('failed profile restart reports rollback failure and retains technical evidence', async () => {
  const state = {};
  const actions = createProfileActions({ state, render: () => {}, refresh: async () => assert.fail('failed activation must not refresh away the draft'), request: async () => ({ ok: false, restart: { ok: false, stderr: 'restart failed', rollback: { ok: false } } }) });
  await assert.rejects(actions.activateProfile('work'), /restart failed.*Откат не завершён/);
  assert.match(state.messageDetails.technical, /rollback/);
  assert.match(state.messageDetails.forMessage, /Откат не завершён/);
});

test('profile editor sends one server-side save/rename request with the loaded revision', async () => {
  const state = {};
  const calls = [];
  const actions = createProfileActions({
    state, render: () => {}, refresh: async () => {},
    request: async (path, options) => {
      if (path.startsWith('/api/profiles/get')) return { name: 'work', config: { remark: 'original' }, revision: 'read-version' };
      calls.push({ path, payload: JSON.parse(options.body) });
      return { ok: true, profile: 'work' };
    },
  });
  await actions.openProfileEditor('work');
  state.profileEditName = 'work.json';
  state.profileEditDraft = '{"remark":"edited"}';
  await actions.saveProfileEditor();
  assert.deepEqual(calls, [{ path: '/api/profiles', payload: { name: 'work.json', config: { remark: 'edited' }, originalName: 'work', expectedRevision: 'read-version' } }]);
  assert.equal(state.profileEditorOpen, false);
  assert.equal(state.profileEditRevision, '');
});

test('profile editor rejects valid JSON with the wrong shape without sending a save', async () => {
  for (const json of ['[]', 'null', '"text"']) {
    const state = { profileEditName: 'work', profileEditDraft: json, profileEditorOpen: true };
    const actions = createProfileActions({ state, render: () => {}, refresh: async () => {}, request: async () => assert.fail('invalid profile must not be sent') });
    await actions.saveProfileEditor();
    assert.equal(state.profileEditorOpen, true);
    assert.match(state.message, /должна быть JSON-объектом/);
  }
});

test('saving the draft as a new profile cannot silently overwrite an existing name', async (t) => {
  const originalPrompt = globalThis.prompt;
  globalThis.prompt = () => 'existing';
  t.after(() => { globalThis.prompt = originalPrompt; });
  const state = { jsonDraft: '{"remark":"my draft"}' };
  const actions = createProfileActions({
    state, render: () => {}, refresh: async () => {},
    request: async (path, options) => {
      assert.equal(path, '/api/profiles');
      assert.deepEqual(JSON.parse(options.body), { name: 'existing', config: { remark: 'my draft' }, createOnly: true });
      throw new Error('Профиль с таким именем уже существует');
    },
  });
  await assert.rejects(actions.saveProfile(), /уже существует/);
  assert.equal(state.jsonDraft, '{"remark":"my draft"}');
});

test('all profile row controls use shared busy/error handling and exclude unrelated actions', async (t) => {
  const originalDocument = globalThis.document;
  t.after(() => { globalThis.document = originalDocument; });
  const selectors = ['[data-profile]', '[data-profile-edit]', '[data-profile-delete]', '[data-profile-download]', '[data-profile-download-anonymized]'];
  const buttons = selectors.map(() => ({ dataset: { profile: 'work', profileEdit: 'work', profileDelete: 'work', profileDownload: 'work', profileDownloadAnonymized: 'work' }, textContent: 'button', classList: { contains: () => false }, addEventListener(_event, handler) { this.click = handler; } }));
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll(selector) {
      assert.notEqual(selector, '[data-action]', 'profile binding must not bind unrelated app controls a second time');
      const index = selectors.indexOf(selector);
      return index < 0 ? [] : [buttons[index]];
    },
  };
  const state = {};
  const busy = [];
  const reject = async () => { throw new Error('Профиль не прошёл проверку Xray'); };
  bindProfileControls({ state, render: () => busy.push(state.busyAction), activateProfile: reject, openProfileEditor: reject, deleteProfile: reject, downloadProfile: reject });
  for (const button of buttons) {
    await button.click({ target: button });
    assert.equal(state.busyAction, '');
    assert.match(state.message, /Профиль не прошёл проверку Xray/);
    assert.ok(busy.includes(button.dataset.action));
  }
});

test('a repeated profile click cannot start a second activation while one is pending', async (t) => {
  const originalDocument = globalThis.document;
  t.after(() => { globalThis.document = originalDocument; });
  const button = { dataset: { profile: 'work' }, classList: { contains: () => false }, textContent: 'Применить профиль', addEventListener(_event, handler) { this.click = handler; } };
  globalThis.document = { querySelector: () => null, querySelectorAll: (selector) => selector === '[data-profile]' ? [button] : [] };
  let resolve;
  let calls = 0;
  const state = {};
  bindProfileControls({ state, render: () => {}, activateProfile: () => { calls++; return new Promise((done) => { resolve = done; }); } });
  const first = button.click({ target: button });
  await button.click({ target: button });
  assert.equal(calls, 1);
  resolve();
  await first;
  assert.equal(state.busyAction, '');
});
