import assert from 'node:assert/strict';
import test from 'node:test';
import { patchServerEditField, serverEditFields, serverFragmentCompatibility, validateServerEditFragment } from '../cmd/ruopenray-ui/web/server-edit-model.js';
import { createServerActions } from '../cmd/ruopenray-ui/web/server-actions.js';
import { createServersView } from '../cmd/ruopenray-ui/web/servers-view.js';
import { escapeHtml } from '../cmd/ruopenray-ui/web/formatters.js';

const fragment = (settings = { packets: 'tlshello', length: '100-200', delay: '10-20' }) => ({ type: 'fragment', settings });
const legacyTag = (raw = '100-200,10-20,tlshello') => `ruopenray-fragment-${Buffer.from(raw).toString('base64url')}`;
const base = () => ({ tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: 'example.test', port: 443, users: [{ id: 'preview-id' }] }] }, streamSettings: { network: 'tcp', security: 'tls', tlsSettings: { serverName: 'example.test' } } });
const native = (settings) => ({ ...base(), streamSettings: { ...base().streamSettings, finalmask: { tcp: [fragment(settings)] } } });

function fixture(outbound = base(), version = '26.10.31') {
  const state = { tab: 'servers', config: { outbounds: [structuredClone(outbound)] }, serverMeta: {},
    status: { core: { version } }, serverEditDialog: true, serverEditIndex: 0,
    serverEditJson: JSON.stringify(outbound), serverEditCountry: '', serverEditCountrySearch: '', serverEditError: '' };
  let renders = 0;
  const requests = [];
  const actions = createServerActions({ state, render: () => { renders += 1; }, configOutbounds: () => state.config.outbounds,
    syncConfig: (config) => { state.config = config; },
    request: async (path, options = {}) => { requests.push({ path, options }); return { ok: true }; } });
  const view = () => createServersView({ state, escapeHtml, configOutbounds: () => state.config.outbounds }).serverEditDialog();
  return { state, actions, requests, view, renders: () => renders };
}

for (const [preset, length, delay] of [['soft', '120-220', '0-8'], ['normal', '100-200', '10-20'], ['hard', '50-120', '20-40']]) {
  test(`${preset} creates a native inner fragment without an outbound chain`, () => {
    const original = base();
    const before = structuredClone(original);
    original.streamSettings.finalmask = { tcp: [{ type: 'header-custom', settings: { request: ['keep'] } }], udp: [{ type: 'noise', settings: { keep: true } }], custom: { untouched: true } };
    before.streamSettings.finalmask = structuredClone(original.streamSettings.finalmask);
    original.streamSettings.sockopt = { dialerProxy: 'my-custom-tunnel', mark: 128 };
    before.streamSettings.sockopt = structuredClone(original.streamSettings.sockopt);
    const next = patchServerEditField(original, 'fragmentPreset', preset);
    assert.deepEqual(original, before);
    assert.deepEqual(next.streamSettings.finalmask.tcp, [fragment({ packets: 'tlshello', length, delay }), ...before.streamSettings.finalmask.tcp]);
    assert.deepEqual(next.streamSettings.finalmask.udp, before.streamSettings.finalmask.udp);
    assert.deepEqual(next.streamSettings.finalmask.custom, before.streamSettings.finalmask.custom);
    assert.deepEqual(next.streamSettings.sockopt, before.streamSettings.sockopt);
    assert.equal(serverEditFields(next).fragmentPreset, preset);
    assert.equal(serverEditFields(next).fragmentSource, 'native');
    assert.equal(validateServerEditFragment(next), '');
  });
}

test('native editing changes the existing mask in place and retains transport and mask extensions', () => {
  const original = native({ packets: '', length: 111, delay: 0, maxSplit: 4, extension: { keep: ['value'] }, lengths: [], delays: [] });
  original.streamSettings.finalmask.tcp.unshift({ type: 'sudoku', settings: { keep: true } });
  original.streamSettings.finalmask.tcp.push({ type: 'future-mask', arbitrary: ['retain'] });
  original.streamSettings.finalmask.udp = [{ type: 'noise', settings: { delay: '1-2' } }];
  original.streamSettings.finalmask.extension = { order: 3 };
  original.streamSettings.sockopt = { dialerProxy: 'custom-tunnel', tcpFastOpen: true };
  const before = structuredClone(original);
  const fields = serverEditFields(original);
  assert.equal(fields.fragmentPackets, '');
  assert.equal(fields.fragmentInterval, '0');
  assert.equal(fields.fragmentLength, '111');
  const next = patchServerEditField(original, 'fragmentLength', '33-77');
  const expected = structuredClone(before);
  Object.assign(expected.streamSettings.finalmask.tcp[1].settings, { length: '33-77', delay: '0', packets: '' });
  assert.deepEqual(next, expected);
  assert.deepEqual(original, before);
  const off = patchServerEditField(next, 'fragmentPreset', 'off');
  expected.streamSettings.finalmask.tcp.splice(1, 1);
  assert.deepEqual(off, expected);
});

test('turning fragment off preserves a custom dialer and cleans only empty owned native containers', () => {
  const original = native();
  original.streamSettings.sockopt = { dialerProxy: 'custom-tunnel', mark: 128 };
  const off = patchServerEditField(original, 'fragmentPreset', 'off');
  assert.equal(off.streamSettings.finalmask, undefined);
  assert.deepEqual(off.streamSettings.sockopt, original.streamSettings.sockopt);
  assert.deepEqual(patchServerEditField(off, 'fragmentPreset', 'off'), off);
  assert.deepEqual(patchServerEditField({ tag: 'custom', streamSettings: { sockopt: { dialerProxy: 'custom-tunnel' } } }, 'fragmentPreset', 'off'), { tag: 'custom', streamSettings: { sockopt: { dialerProxy: 'custom-tunnel' } } });
});

for (const raw of ['100-200,10-20,tlshello', '120-220,0-8,tlshello', '33-77,5-9,1-2', '100-200']) {
  test(`legacy ${raw} is read without migration until an explicit fragment edit`, () => {
    const original = base();
    original.streamSettings.sockopt = { dialerProxy: legacyTag(raw), mark: 128 };
    const before = structuredClone(original);
    assert.equal(serverEditFields(original).fragmentSource, 'legacy');
    const renamed = patchServerEditField(original, 'tag', 'renamed');
    assert.deepEqual(renamed.streamSettings, before.streamSettings);
    assert.deepEqual(original, before);
    const next = patchServerEditField(original, 'fragmentPreset', 'custom');
    const fields = serverEditFields(original);
    assert.deepEqual(next.streamSettings.finalmask.tcp, [fragment({ length: fields.fragmentLength, delay: fields.fragmentInterval, packets: fields.fragmentPackets })]);
    assert.deepEqual(next.streamSettings.sockopt, { mark: 128 });
    const off = patchServerEditField(original, 'fragmentPreset', 'off');
    assert.deepEqual(off.streamSettings.sockopt, { mark: 128 });
    assert.equal(off.streamSettings.finalmask, undefined);
  });
}

const opaqueCases = [
  { finalmask: [{ type: 'fragment' }] },
  { finalmask: { tcp: { type: 'fragment' } } },
  { finalmask: { tcp: [fragment(), fragment()] } },
  { finalmask: { tcp: [{ type: 'Fragment', settings: { length: '100-200' } }] } },
  { finalmask: { tcp: [fragment({ length: '100-200', lengths: ['40-50'], delay: '0' })] } },
  { finalmask: { tcp: [fragment({ length: '100-200', delays: ['2-3'] })] } },
  { finalmask: { tcp: [{ type: 'fragment' }] } },
  { finalmask: { tcp: [fragment()] }, sockopt: { dialerProxy: legacyTag() } },
  { sockopt: { dialerProxy: 'ruopenray-fragment-???' } }
];
for (const [index, stream] of opaqueCases.entries()) {
  test(`opaque fragmentation ${index + 1} is preserved, explained, and never replaced by a basic field`, () => {
    const outbound = { ...base(), streamSettings: { ...base().streamSettings, ...stream } };
    const before = structuredClone(outbound);
    assert.equal(serverEditFields(outbound).fragmentReadOnly, true);
    assert.match(serverEditFields(outbound).fragmentNotice, /JSON/);
    assert.throws(() => patchServerEditField(outbound, 'fragmentPreset', 'normal'), /JSON/);
    assert.throws(() => patchServerEditField(outbound, 'fragmentPreset', 'off'), /JSON/);
    assert.deepEqual(patchServerEditField(outbound, 'tag', 'renamed').streamSettings, before.streamSettings);
    assert.deepEqual(outbound, before);
    assert.equal(validateServerEditFragment(outbound), '');
  });
}

test('missing native packets/delay display their actual defaults without assuming TLS ClientHello', () => {
  const outbound = native({ length: 120 });
  const fields = serverEditFields(outbound);
  assert.equal(fields.fragmentPackets, '');
  assert.equal(fields.fragmentInterval, '0');
  const { view } = fixture(outbound);
  assert.match(view(), /id="serverEdit_fragmentPackets"[^>]*value=""/);
  assert.equal(validateServerEditFragment(outbound), '');
});

for (const [version, supported] of [['1.8.24', false], ['25.12.8', false], ['26.2.6', false], ['26.3.26', false], ['26.3.27', true], ['v26.3.27', true], ['Xray 26.10.31 (Xray, Penetrates Everything.)', true], ['27.1.1', true], ['', false], ['unknown', false]]) {
  test(`native enable guard recognizes ${version || 'missing version'}`, () => {
    assert.equal(serverFragmentCompatibility(version).supported, supported);
  });
}

for (const version of ['', '26.2.6']) {
  test(`unknown/old core ${version || '(unknown)'} blocks enabling but permits an owned off operation`, () => {
    const outbound = base();
    outbound.streamSettings.sockopt = { dialerProxy: legacyTag(), mark: 128 };
    const { state, actions, view, renders } = fixture(outbound, version);
    const before = state.serverEditJson;
    actions.updateServerEditField('fragmentPreset', 'normal', { rerender: true });
    assert.equal(state.serverEditJson, before);
    assert.match(state.serverEditError, /26\.3\.27/);
    assert.ok(renders() > 0);
    const html = view();
    assert.match(html, /<option value="normal"[^>]*disabled/);
    assert.doesNotMatch(html, /<option value="off"[^>]*disabled/);
    assert.match(html, /id="serverEdit_fragmentHelp"/);
    actions.updateServerEditField('fragmentPreset', 'off', { rerender: true });
    assert.equal(state.serverEditError, '');
    assert.deepEqual(JSON.parse(state.serverEditJson).streamSettings.sockopt, { mark: 128 });
    actions.updateServerEditField('sni', 'changed.example.test');
    assert.equal(JSON.parse(state.serverEditJson).streamSettings.tlsSettings.serverName, 'changed.example.test');
  });
  test(`unknown/old core ${version || '(unknown)'} permits disabling a simple native fragment`, () => {
    const { state, actions } = fixture(native(), version);
    actions.updateServerEditField('fragmentPreset', 'off', { rerender: true });
    assert.equal(state.serverEditError, '');
    assert.equal(JSON.parse(state.serverEditJson).streamSettings.finalmask, undefined);
  });
}

test('custom mode retains preset values while keeping its editable fields available', () => {
  const { state, actions, view } = fixture(native());
  actions.updateServerEditField('fragmentPreset', 'custom', { rerender: true });
  assert.deepEqual(JSON.parse(state.serverEditJson), native());
  assert.equal(state.serverEditFragmentCustom, true);
  let html = view();
  assert.match(html, /<option value="custom" selected/);
  assert.doesNotMatch(html.match(/<input id="serverEdit_fragmentLength"[^>]*>/)[0], /disabled/);
  actions.updateServerEditField('fragmentPackets', '');
  actions.updateServerEditField('fragmentLength', '33-77');
  actions.updateServerEditField('fragmentInterval', '5-9');
  assert.deepEqual(JSON.parse(state.serverEditJson).streamSettings.finalmask.tcp, [fragment({ length: '33-77', delay: '5-9', packets: '' })]);
  actions.closeServerEditor();
  actions.openServerEditor(0);
  assert.equal(state.serverEditFragmentCustom, false);
});

test('ambiguous model errors stay inside the dialog and preserve editor JSON', () => {
  const outbound = { ...base(), streamSettings: { finalmask: { tcp: [fragment(), fragment()] } } };
  const { state, actions, view } = fixture(outbound);
  const before = state.serverEditJson;
  assert.doesNotThrow(() => actions.updateServerEditField('fragmentPreset', 'off', { rerender: true }));
  assert.equal(state.serverEditJson, before);
  assert.equal(state.serverEditDialog, true);
  assert.match(state.serverEditError, /JSON/);
  assert.match(view(), /<select id="serverEdit_fragmentPreset"[^>]*disabled/);
});

test('saving an unrelated field retains opaque arrays and multiple fragment masks unchanged', async () => {
  const outbound = native({ lengths: ['100-120', '140-160'], delays: ['1-2'], maxSplit: 5 });
  outbound.streamSettings.finalmask.tcp.push(fragment());
  const { state, actions } = fixture(outbound);
  actions.updateServerEditField('tag', 'renamed');
  await actions.saveServerEdit();
  assert.equal(state.serverEditDialog, false);
  assert.equal(state.config.outbounds[0].tag, 'renamed');
  assert.deepEqual(state.config.outbounds[0].streamSettings, outbound.streamSettings);
});

test('scalar validation accepts explicit all-packets, zero delay and int32 boundaries', () => {
  assert.equal(validateServerEditFragment(native({ packets: '', length: 2147483647, delay: 0 })), '');
  assert.equal(validateServerEditFragment(native({ packets: '1-2147483647', length: '1-2147483647', delay: '0-2147483647' })), '');
});

for (const [field, value] of [['length', '-1'], ['length', '0'], ['length', '200-100'], ['length', '2147483648'], ['delay', '-1'], ['delay', '20-10'], ['packets', '0'], ['packets', '3-1']]) {
  test(`saving advanced scalar ${field}=${value} is rejected before the config draft changes`, async () => {
    const { state, actions, requests } = fixture(native());
    const before = structuredClone(state.config);
    const edit = JSON.parse(state.serverEditJson);
    edit.streamSettings.finalmask.tcp[0].settings[field] = value;
    state.serverEditJson = JSON.stringify(edit);
    await actions.saveServerEdit();
    assert.deepEqual(state.config, before);
    assert.equal(state.serverEditDialog, true);
    assert.notEqual(state.serverEditError, '');
    assert.equal(requests.length, 0);
  });
}

test('custom partial typing stays in the editor and a completed valid range saves native JSON', async () => {
  const { state, actions, requests } = fixture(native());
  actions.updateServerEditField('fragmentPreset', 'custom');
  actions.updateServerEditField('fragmentLength', '100-');
  assert.equal(JSON.parse(state.serverEditJson).streamSettings.finalmask.tcp[0].settings.length, '100-');
  await actions.saveServerEdit();
  assert.match(state.serverEditError, /Длина/);
  assert.equal(state.serverEditDialog, true);
  actions.updateServerEditField('fragmentLength', '100-220');
  await actions.saveServerEdit();
  assert.equal(state.serverEditDialog, false);
  assert.equal(state.config.outbounds[0].streamSettings.finalmask.tcp[0].settings.length, '100-220');
  assert.equal(state.config.outbounds[0].streamSettings.sockopt?.dialerProxy, undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/api/server-meta');
});
