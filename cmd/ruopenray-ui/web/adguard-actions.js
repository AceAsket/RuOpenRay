import { adguardUpstreamList, adguardUpstreamText } from './adguard-upstreams-view.js';

export function createAdguardActions({ state, request, render, syncLanDnsStatus, refreshDomainMonitor }) {
  async function adguardRefresh() {
    await Promise.all([
      request('/api/dns/adguard').then((status) => { state.adguardStatus = status; }),
      refreshDomainMonitor?.(false, { force: true }).catch(() => { state.domainMonitor = null; }),
    ]);
    render();
  }
  async function action(payload, message) {
    const result = await request('/api/dns/adguard', { method: 'POST', body: JSON.stringify(payload) });
    if (!result.ok) throw new Error(result.error || 'Не удалось обновить AdGuard Home');
    if (payload.action === 'check') state.adguardCheckResult = result;
    else state.adguardCheckResult = null;
    await adguardRefresh();
    const lan = await request('/api/dns/lan-upstream');
    syncLanDnsStatus(lan);
    state.message = message;
    render();
  }
  return {
    adguardRefresh,
    adguardUpstreamReset: async () => {
      await adguardRefresh();
      state.adguardUpstreamDraft = null;
      state.adguardUpstreamBase = null;
      state.adguardUpstreamResult = null;
      render();
    },
    adguardUpstreamCheck: async () => {
      const text = adguardUpstreamText(state);
      state.adguardUpstreamResult = null;
      const result = await request('/api/dns/adguard', { method: 'POST', body: JSON.stringify({ action: 'upstream-check', upstreams: adguardUpstreamList(state) }) });
      if (!result.ok) throw new Error(result.error || 'Не удалось проверить DoH');
      if (adguardUpstreamText(state) === text) {
        state.adguardUpstreamResult = result;
        state.message = 'Замер DoH завершён; DNS-настройки не изменены';
      } else state.message = 'Список изменён во время замера. Запустите проверку заново';
      render();
    },
    adguardUpstreamSave: async () => {
      const text = adguardUpstreamText(state);
      const result = await request('/api/dns/adguard', { method: 'POST', body: JSON.stringify({ action: 'upstream-save', upstreams: adguardUpstreamList(state),
        baseUpstreams: state.adguardUpstreamBase ?? state.adguardStatus?.upstreamSnapshot }) });
      if (!result.ok) throw new Error(result.error || 'Не удалось сохранить DoH');
      if (adguardUpstreamText(state) === text) {
        state.adguardUpstreamDraft = null;
        state.adguardUpstreamBase = null;
      }
      state.message = 'DoH проверены и сохранены в AdGuard Home';
      await adguardRefresh();
      syncLanDnsStatus(await request('/api/dns/lan-upstream'));
      render();
    },
    adguardConfigure: async () => {
      try {
        await action({ action: 'configure', url: state.adguardUrl || state.adguardStatus?.url || 'http://127.0.0.1:3001',
          username: state.adguardUsername ?? state.adguardStatus?.username ?? 'admin', password: state.adguardPassword || '',
          enabled: state.adguardSyncEnabled ?? state.adguardStatus?.enabled ?? true,
          bootstrapDns: (state.adguardBootstrap ?? (state.adguardStatus?.bootstrapDns || ['https://8.8.8.8/dns-query', 'https://1.1.1.1/dns-query']).join('\n')).split(/\r?\n/).map((value) => value.trim()).filter(Boolean) }, 'Подключение AdGuard Home сохранено');
      } finally { state.adguardPassword = ''; }
    },
    adguardProtection: () => action({ action: 'protection', enabled: !state.adguardStatus?.protectionEnabled }, 'Состояние фильтрации изменено'),
    adguardSync: () => action({ action: 'sync' }, 'DNS для VPN-серверов синхронизирован'),
    adguardCheck: () => action({ action: 'check', domain: state.adguardDomain }, 'Проверка фильтра выполнена'),
    adguardExceptionAdd: () => action({ action: 'exception', domain: state.adguardDomain }, 'Домен добавлен в исключения'),
    adguardExceptionRemove: () => action({ action: 'exception', domain: state.adguardDomain, remove: true }, 'Исключение удалено'),
  };
}
