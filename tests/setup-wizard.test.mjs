import assert from 'node:assert/strict';

import { createSetupModel } from '../cmd/ruopenray-ui/web/setup-model.js';
import { createSetupView, setupWizardStepIds } from '../cmd/ruopenray-ui/web/setup-view.js';

assert.deepEqual(
  setupWizardStepIds,
  ['connection', 'scenarios', 'launch'],
  'мастер должен состоять из трёх этапов',
);

assert.equal(new Set(setupWizardStepIds).size, 3, 'этапы мастера не должны повторяться');

function xrayUpdateInfo(installed, releases) {
  const state = {
    status: { core: { version: `Xray ${installed}` } },
    coreReleases: releases.map((release) => ({ assetUrl: 'https://example.test/xray', ...release })),
    coreReleaseFilter: 'stable',
  };
  return createSetupView({
    state,
    shellQuote: String,
    escapeHtml: String,
    byteSize: String,
    setupReadiness: () => ({}),
    loadSetupSnapshot: async () => {},
    firewallReadyStatus: () => false,
    firewallPorts: () => ({}),
  }).coreUpdateInfo();
}

{
  const info = xrayUpdateInfo('26.3.27', [
    { tag: 'v26.4.0-rc.2', prerelease: true },
    { tag: 'v26.3.28', prerelease: false },
  ]);
  assert.equal(info.channel, 'stable', 'стабильная установка должна оставаться в stable-канале');
  assert.equal(info.target?.tag, 'v26.3.28', 'для stable нужно выбирать более новый stable, а не RC');
  assert.equal(info.hasUpdate, true, 'более новый stable должен подсвечиваться');
}

{
  const info = xrayUpdateInfo('26.3.28', [
    { tag: 'v26.4.0-rc.2', prerelease: true },
    { tag: 'v26.3.28', prerelease: false },
  ]);
  assert.equal(info.hasUpdate, false, 'RC не должен подсвечивать обновление для актуального stable');
}

{
  const info = xrayUpdateInfo('26.4.0-rc.1', [
    { tag: 'v26.3.28', prerelease: false },
    { tag: 'v26.4.0-rc.2', prerelease: true },
  ]);
  assert.equal(info.channel, 'rc', 'RC-установка должна сравниваться в RC-канале');
  assert.equal(info.target?.tag, 'v26.4.0-rc.2', 'для RC нужно находить следующий RC');
  assert.equal(info.hasUpdate, true, 'более новый RC должен подсвечиваться');
}

{
  const info = xrayUpdateInfo('26.4.0-rc.2', [
    { tag: 'v26.4.0', prerelease: false },
    { tag: 'v26.4.0-rc.2', prerelease: true },
  ]);
  assert.equal(info.target?.tag, 'v26.4.0', 'финальный релиз той же версии должен считаться обновлением RC');
  assert.equal(info.hasUpdate, true, 'выход stable после RC должен подсвечиваться');
}

function setupState(fallbackMode) {
  return {
    setupFallbackMode: fallbackMode,
    firewallRouterMode: 'tproxy',
    lanDnsStatus: { suggestedXrayPort: 10535 },
    dnsInboundPort: '10535',
    message: '',
    config: {
      inbounds: [],
      outbounds: [
        { tag: 'direct', protocol: 'freedom' },
        { tag: 'block', protocol: 'blackhole' },
        { tag: 'nl-proxy', protocol: 'vless', settings: { vnext: [{ address: 'vpn.example', port: 443 }] } },
      ],
      dns: { servers: [] },
      routing: { rules: [{ type: 'field', domain: ['domain:example.com'], outboundTag: 'nl-proxy' }] },
    },
  };
}

function prepareFor(fallbackMode) {
  const state = setupState(fallbackMode);
  const model = createSetupModel({
    state,
    byteSize: (value) => String(value || 0),
    firewallInfo: () => ({ ready: false, transparent: [] }),
    firewallReadyStatus: () => false,
    proxyOutbounds: () => state.config.outbounds.filter((item) => item.tag === 'nl-proxy'),
    request: async () => ({}),
    syncConfig: (next) => { state.config = next; state.jsonDraft = JSON.stringify(next); },
    ensureDnsServer: (config, server) => {
      config.dns.servers = config.dns.servers || [];
      if (!config.dns.servers.includes(server)) config.dns.servers.push(server);
    },
  });
  model.prepareSetupDraft({ message: false });
  return state.config.routing.rules.find((rule) =>
    Array.isArray(rule.inboundTag)
    && rule.inboundTag.includes('transparent_ipv4')
    && !rule.domain
    && !rule.ip
    && !rule.source
  );
}

assert.equal(prepareFor('direct')?.outboundTag, 'direct', 'по умолчанию остальной интернет должен идти напрямую');
assert.equal(prepareFor('proxy')?.outboundTag, 'nl-proxy', 'режим всего интернета должен использовать подключение');

{
  const state = setupState('direct');
  let syncOptions = null;
  const model = createSetupModel({
    state,
    byteSize: (value) => String(value || 0),
    firewallInfo: () => ({ ready: false, transparent: [] }),
    firewallReadyStatus: () => false,
    proxyOutbounds: () => state.config.outbounds.filter((item) => item.tag === 'nl-proxy'),
    request: async () => ({}),
    syncConfig: (next, options) => {
      state.config = next;
      state.jsonDraft = JSON.stringify(next);
      syncOptions = options;
    },
    ensureDnsServer: (config, server) => {
      config.dns.servers = config.dns.servers || [];
      if (!config.dns.servers.includes(server)) config.dns.servers.push(server);
    },
  });
  model.prepareSetupDraft({ message: false, persist: false });
  assert.equal(syncOptions?.persist, false, 'запуск мастера не должен сохранять промежуточный серверный черновик');
}

console.log('Мастер: 3 этапа, оба режима трафика и запуск без промежуточного черновика зафиксированы');
