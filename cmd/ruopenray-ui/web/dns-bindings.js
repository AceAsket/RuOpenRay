import { adguardUpstreamText, dohUrlKey } from './adguard-upstreams-view.js';

export function bindDnsControls({
  state,
  render,
  adguardRefresh,
  removeDnsServer,
  moveDnsServer,
  prioritizeDohDnsServers,
  editDnsHost,
  removeDnsHost,
  editDnsPolicy,
  setDnsModeDraft,
}) {
  document.querySelectorAll('[data-dns-view="adguard"]').forEach((button) => {
    button.addEventListener('click', () => adguardRefresh?.().catch((error) => { state.message = error.message; render(); }));
  });
  for (const [id, key] of [['adguardUrl', 'adguardUrl'], ['adguardUsername', 'adguardUsername'], ['adguardPassword', 'adguardPassword'], ['adguardBootstrap', 'adguardBootstrap'], ['adguardDomain', 'adguardDomain']]) {
    document.querySelector(`#${id}`)?.addEventListener('input', (event) => {
      state[key] = event.target.value;
      if (key === 'adguardDomain') state.adguardCheckResult = null;
    });
  }
  document.querySelector('#adguardSyncEnabled')?.addEventListener('change', (event) => { state.adguardSyncEnabled = event.target.checked; });
  const editUpstreams = (value) => {
    if (state.adguardUpstreamDraft == null) state.adguardUpstreamBase = state.adguardStatus?.upstreamSnapshot?.slice();
    state.adguardUpstreamDraft = value;
    state.adguardUpstreamResult = null;
  };
  document.querySelector('#adguardUpstreams')?.addEventListener('input', (event) => { editUpstreams(event.target.value); });
  document.querySelectorAll('[data-adguard-upstream-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.adguardUpstreamPreset;
      const lines = adguardUpstreamText(state).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!lines.some((line) => dohUrlKey(line) === dohUrlKey(value))) {
        editUpstreams([...lines, value].join('\n'));
        render();
      }
    });
  });
  document.querySelectorAll('[data-dns-delete]').forEach((button) => {
    button.addEventListener('click', () => removeDnsServer(Number(button.dataset.dnsDelete)));
  });
  document.querySelectorAll('[data-dns-move]').forEach((button) => {
    button.addEventListener('click', () => moveDnsServer(Number(button.dataset.dnsMove), Number(button.dataset.direction) || 0));
  });
  document.querySelectorAll('[data-dns-prioritize-doh]').forEach((button) => {
    button.addEventListener('click', () => prioritizeDohDnsServers());
  });
  document.querySelectorAll('[data-dns-host-edit]').forEach((button) => {
    button.addEventListener('click', () => editDnsHost(button.dataset.dnsHostEdit || ''));
  });
  document.querySelectorAll('[data-dns-host-delete]').forEach((button) => {
    button.addEventListener('click', () => removeDnsHost(button.dataset.dnsHostDelete || ''));
  });
  document.querySelectorAll('[data-dns-policy-edit]').forEach((button) => {
    button.addEventListener('click', () => editDnsPolicy(Number(button.dataset.dnsPolicyEdit)));
  });
  document.querySelectorAll('[data-dns-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      state.dnsAddress = button.dataset.dnsPreset;
      state.dnsBootstrapResult = null;
      state.dnsCustomAddOpen = true;
      render();
    });
  });
  document.querySelector('[data-dns-custom-add]')?.addEventListener('toggle', (event) => {
    state.dnsCustomAddOpen = event.target.open;
  });
  document.querySelectorAll('[data-lan-dns-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.lanDnsMode = button.dataset.lanDnsMode;
      state.lanDnsPreview = null;
      render();
    });
  });

  document.querySelectorAll('[data-dns-mode]').forEach((button) => {
    button.addEventListener('click', () => setDnsModeDraft(button.dataset.dnsMode));
  });

  document.querySelector('#dnsAddress')?.addEventListener('input', (event) => {
    state.dnsAddress = event.target.value;
    state.dnsBootstrapResult = null;
  });
  document.querySelector('#dnsAuthEnabled')?.addEventListener('change', (event) => {
    state.dnsAuthEnabled = event.target.checked;
    state.dnsBootstrapResult = null;
    render();
  });
  document.querySelector('#dnsAuthUser')?.addEventListener('input', (event) => {
    state.dnsAuthUser = event.target.value;
    state.dnsBootstrapResult = null;
  });
  document.querySelector('#dnsAuthPassword')?.addEventListener('input', (event) => {
    state.dnsAuthPassword = event.target.value;
    state.dnsBootstrapResult = null;
  });
  document.querySelector('#dnsDomains')?.addEventListener('input', (event) => {
    state.dnsDomains = event.target.value;
  });
  document.querySelector('#dnsPolicyServer')?.addEventListener('change', (event) => {
    editDnsPolicy(Number(event.target.value));
  });
  document.querySelector('#dnsPolicyDomains')?.addEventListener('input', (event) => {
    state.dnsPolicyDomains = event.target.value;
  });
  document.querySelector('#dnsHostName')?.addEventListener('input', (event) => {
    state.dnsHostName = event.target.value;
  });
  document.querySelector('#dnsHostValue')?.addEventListener('input', (event) => {
    state.dnsHostValue = event.target.value;
  });
  document.querySelector('#dnsCheckHost')?.addEventListener('input', (event) => {
    state.dnsCheckHost = event.target.value;
  });
  document.querySelector('#lanDnsUpstream')?.addEventListener('input', (event) => {
    state.lanDnsUpstream = event.target.value;
    state.lanDnsPreview = null;
  });
  document.querySelector('#dnsInboundPort')?.addEventListener('input', (event) => {
    state.dnsInboundPort = event.target.value;
    state.lanDnsPreview = null;
  });
  document.querySelector('#lanDnsRestart')?.addEventListener('change', (event) => {
    state.lanDnsRestart = event.target.checked;
    state.lanDnsPreview = null;
    render();
  });
  document.querySelector('#setupLanDnsUpstream')?.addEventListener('input', (event) => {
    state.setupLanDnsUpstream = event.target.value;
  });
  document.querySelector('#setupRestartDnsmasq')?.addEventListener('change', (event) => {
    state.setupRestartDnsmasq = event.target.checked;
    render();
  });
}
