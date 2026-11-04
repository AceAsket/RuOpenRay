import assert from 'node:assert/strict';
import test from 'node:test';
import { bindActionControls } from '../cmd/ruopenray-ui/web/action-bindings.js';
import { bindSettingsControls } from '../cmd/ruopenray-ui/web/settings-bindings.js';
import { createSettingsView } from '../cmd/ruopenray-ui/web/settings-view.js';
import { createXrayDraftActions } from '../cmd/ruopenray-ui/web/xray-draft-actions.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

test('proxy form survives render before save, including authentication, checkbox changes and invalid input', async () => {
  const previousDocument = globalThis.document;
  const state = { settingsView: 'local-proxy', config: { inbounds: [{ tag: 'socks-in', protocol: 'socks', listen: '127.0.0.1', port: 10808 }] } };
  let fields;
  let click;
  let saves = 0;
  const view = createSettingsView({ state, escapeHtml, byteSize: String });
  const button = { dataset: { action: 'saveLocalProxyDraft' }, textContent: 'Обновить черновик Xray',
    classList: { contains: () => false }, addEventListener(_name, handler) { click = handler; } };
  const actions = createXrayDraftActions({ state, render, syncConfig(config) { state.config = config; saves++; } });
  function render() {
    fields = new Map();
    for (const match of view.settingsPanel().matchAll(/<input\b[^>]*\bid="(localProxy[^"]+)"[^>]*>/g)) {
      const listeners = {};
      fields.set(match[1], { value: match[0].match(/\bvalue="([^"]*)"/)?.[1] || '',
        checked: /\schecked(?:\s|\/?>)/.test(match[0]),
        addEventListener(name, handler) { listeners[name] = handler; }, listeners });
    }
    bindSettingsControls({ state, render });
    bindActionControls({ state, render, buttons: [button], handlers: { saveLocalProxyDraft: actions.saveLocalProxyDraft } });
  }
  function input(id, value, event = 'input') {
    const field = fields.get(id);
    field[typeof value === 'boolean' ? 'checked' : 'value'] = value;
    field.listeners[event]({ target: field });
  }
  try {
    globalThis.document = { querySelector(selector) { return fields?.get(selector.slice(1)); }, querySelectorAll: () => [], getElementById(id) { return fields.get(id); } };
    render();
    input('localProxySocksPort', '10999');
    input('localProxySocksUser', 'new-user');
    input('localProxySocksPass', 'new-password');
    input('localProxySocksAuth', true, 'change');
    input('localProxyHttpEnabled', true, 'change');
    input('localProxyHttpListen', '192.168.1.1');
    render(); // the same render used by background refresh and beginBusy
    assert.equal(fields.get('localProxySocksPort').value, '10999');
    assert.match(view.settingsPanel(), /не добавлено в черновик/);
    await click({ target: button });
    assert.equal(saves, 1);
    assert.equal(state.config.inbounds[0].port, 10999);
    assert.deepEqual(state.config.inbounds[0].settings.accounts, [{ user: 'new-user', pass: 'new-password' }]);
    assert.equal(state.config.inbounds[1].listen, '192.168.1.1');
    assert.equal(state.localProxyForm, null);
    assert.doesNotMatch(view.settingsPanel(), /не добавлено в черновик/);
    input('localProxySocksPort', '70000');
    await click({ target: button });
    assert.equal(saves, 1);
    assert.equal(fields.get('localProxySocksPort').value, '70000');
    assert.match(state.message, /порт должен быть/);
  } finally { globalThis.document = previousDocument; }
});
