export function createFirewallMapController({ state, request, render }) {
  let generation = 0, active = null, ownerToken = null;

  async function load({ force = false } = {}) {
    const token = state.token;
    if (active?.token === token) return;
    if (!force && ownerToken === token && state.firewallMap?.ok) return;
    active?.controller.abort();
    const id = ++generation, controller = new AbortController();
    active = { token, controller };
    if (ownerToken !== token) state.firewallMap = null;
    state.firewallMapLoading = true;
    state.firewallMapError = '';
    render();
    let timer;
    const current = () => id === generation && state.token === token;
    try {
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Не удалось дождаться снимка nftables. Повторите обновление.')); }, 10000); });
      const result = await Promise.race([request('/api/firewall/map', { signal: controller.signal }), timeout]);
      if (!current()) return;
      if (!result?.ok || !Array.isArray(result.chains)) throw new Error(result?.error || 'Карта nftables недоступна');
      ownerToken = token;
      state.firewallMap = result;
    } catch (error) {
      if (current()) state.firewallMapError = error.message || 'Не удалось загрузить карту nftables';
    } finally {
      clearTimeout(timer);
      if (id === generation) { active = null; state.firewallMapLoading = false; }
      if (current()) render();
    }
  }

  function selectChain(id, from) {
    if (!state.firewallMap?.chains?.some((chain) => chain.id === id)) return;
    state.firewallMapTrail = from ? [...(state.firewallMapTrail || []), from].slice(-32) : [];
    state.firewallMapChain = id;
    state.firewallMapRuleLimit = 200;
    render();
  }

  function bind() {
    document.querySelectorAll('[data-firewall-map-refresh]').forEach((button) => button.addEventListener('click', () => void load({ force: true })));
    document.querySelectorAll('[data-firewall-map-family]').forEach((button) => button.addEventListener('click', () => {
      const family = button.dataset.firewallMapFamily;
      if (!['ip', 'ip6', 'all'].includes(family)) return;
      Object.assign(state, { firewallMapFamily: family, firewallMapChain: '', firewallMapTrail: [], firewallMapRuleLimit: 200 });
      render();
    }));
    document.querySelectorAll('[data-firewall-map-view]').forEach((button) => button.addEventListener('click', () => {
      state.firewallMapView = button.dataset.firewallMapView === 'chains' ? 'chains' : 'topology';
      if (state.firewallMapView === 'topology' && state.firewallMapFamily === 'all') state.firewallMapFamily = 'ip';
      render();
    }));
    document.querySelector('#firewallMapScenario')?.addEventListener('change', (event) => {
      const scenario = event.target.value;
      if (!['forward', 'input', 'output'].includes(scenario)) return;
      state.firewallMapScenario = scenario;
      state.firewallMapHook = scenario === 'output' ? 'output' : 'prerouting';
      state.firewallMapChain = ''; state.firewallMapTrail = [];
      render();
    });
    document.querySelectorAll('[data-firewall-map-hook]').forEach((button) => {
      const activate = () => {
        const hook = button.dataset.firewallMapHook;
        if (!['prerouting', 'input', 'forward', 'output', 'postrouting'].includes(hook)) return;
        state.firewallMapHook = hook; state.firewallMapChain = ''; state.firewallMapTrail = []; state.firewallMapRuleLimit = 200;
        render();
        const selector = button.tagName?.toLowerCase() === 'button' ? `button[data-firewall-map-hook="${hook}"]` : `[data-firewall-map-hook="${hook}"][tabindex]`;
        document.querySelector(selector)?.focus({ preventScroll: true });
      };
      button.addEventListener('click', activate);
      if (button.tagName?.toLowerCase() !== 'button') button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      });
    });
    document.querySelectorAll('[data-firewall-map-chain]').forEach((button) => button.addEventListener('click', () => selectChain(button.dataset.firewallMapChain, button.dataset.firewallMapFrom)));
    document.querySelector('[data-firewall-map-back]')?.addEventListener('click', () => {
      const trail = [...(state.firewallMapTrail || [])];
      state.firewallMapChain = trail.pop() || ''; state.firewallMapTrail = trail; state.firewallMapRuleLimit = 200; render();
    });
    document.querySelector('[data-firewall-map-more]')?.addEventListener('click', () => { state.firewallMapRuleLimit = (state.firewallMapRuleLimit || 200) + 200; render(); });
    document.querySelector('#firewallMapSearch')?.addEventListener('input', (event) => {
      state.firewallMapQuery = event.target.value;
      const query = event.target.value.trim().toLowerCase();
      document.querySelectorAll('[data-firewall-map-search-text]').forEach((row) => { row.hidden = !row.dataset.firewallMapSearchText.includes(query); });
    });
  }

  return { load, bind };
}
