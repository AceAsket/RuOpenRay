export function createAdguardActions({ state, request, render, syncLanDnsStatus }) {
  async function adguardRefresh() {
    state.adguardStatus = await request('/api/dns/adguard');
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
