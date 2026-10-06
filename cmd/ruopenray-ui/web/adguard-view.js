import { adguardUpstreamsSection } from './adguard-upstreams-view.js';

function filteringReason(reason) {
  const labels = {
    NotFilteredNotFound: 'Фильтр не нашёл блокирующего правила',
    NotFilteredWhiteList: 'Разрешён исключением',
    NotFilteredError: 'Ошибка проверки фильтра',
    FilteredBlackList: 'Заблокирован фильтром',
    FilteredSafeBrowsing: 'Заблокирован защитой от опасных сайтов',
    FilteredParental: 'Заблокирован родительским контролем',
    FilteredInvalid: 'Заблокирован: некорректный домен',
    FilteredSafeSearch: 'Изменён безопасным поиском',
    FilteredBlockedService: 'Заблокирован настройкой сервиса',
    Rewrite: 'Используется подмена DNS',
    RewriteEtcHosts: 'Используется локальная запись hosts',
    RewriteRule: 'Используется правило подмены DNS',
  };
  return Object.hasOwn(labels, reason) ? labels[reason] : (reason ? `Неизвестный результат AdGuard: ${reason}` : 'Нет результата проверки');
}

export function adguardAdminUrl(apiUrl, pageUrl = globalThis.location?.href) {
  try {
    const api = new URL(apiUrl);
    const page = new URL(pageUrl);
    if (!['http:', 'https:'].includes(api.protocol) || !['http:', 'https:'].includes(page.protocol)
      || !(/^127(?:\.\d{1,3}){3}$/.test(api.hostname) || api.hostname === '[::1]')
      || api.username || api.password || (api.pathname !== '/' && api.pathname !== '') || api.search || api.hash) return '';
    api.hostname = page.hostname;
    return api.href;
  } catch {
    return '';
  }
}

function dnsClientJournal(state) {
  const monitor = state.domainMonitor;
  const known = typeof monitor?.dnsmasq?.logqueries === 'boolean';
  const enabled = monitor?.dnsmasq?.logqueries === true;
  const busy = ['enableDnsmasqLogqueries', 'disableDnsmasqLogqueries'].includes(state.busyAction);
  return `<section class="adguard-dns-clients" aria-label="DNS-запросы по устройствам">
    <div class="panel-title"><div><h3>DNS-запросы по устройствам</h3><span>IP клиента и имя из DHCP в журнале RuOpenRay.</span></div>
      <strong class="status-chip ${known ? (enabled ? 'ok' : 'warn') : ''}">${known ? (enabled ? 'Журнал включён' : 'Журнал выключен') : 'Статус недоступен'}</strong></div>
    <p class="muted">В схеме dnsmasq → AdGuard Home журнал AdGuard показывает локального посредника — 127.0.0.1. RuOpenRay берёт исходный IP устройства из журнала dnsmasq; адрес клиента в самом AdGuard не изменится.</p>
    ${enabled && monitor.running === false ? '<p class="settings-warning">Монитор доменов остановлен. Запустите его в Диагностике, чтобы видеть DNS-запросы устройств.</p>' : ''}
    <p class="muted">Включение и выключение перезапускает dnsmasq: возможна короткая пауза DNS. Запросы записываются в системный журнал; VPN и маршрут DoH не меняются.</p>
    <div class="split-actions">
      <button class="btn ${enabled ? 'secondary' : 'primary'}" data-action="${enabled ? 'disableDnsmasqLogqueries' : 'enableDnsmasqLogqueries'}" ${!known || state.busyAction ? 'disabled' : ''}>${busy ? 'Сохраняю…' : enabled ? 'Выключить журнал DNS' : 'Включить журнал DNS'}</button>
      <button class="btn secondary" data-tab-jump="diagnostics" data-diagnostics-jump="domains">Открыть журнал RuOpenRay</button>
      ${known ? '' : '<button class="btn secondary" data-action="adguardRefresh">Обновить статус</button>'}
    </div>
  </section>`;
}

export function adguardSection(state, escapeHtml, pageUrl = globalThis.location?.href) {
  const status = state.adguardStatus || {};
  const busy = String(state.busyAction || '').startsWith('adguard');
  const disabled = busy || !status.configured || !status.ok;
  const chain = state.lanDnsStatus?.adguardHome || {};
  const adminUrl = status.configured ? adguardAdminUrl(status.url, pageUrl) : '';
  return `<section class="panel settings-section adguard-section">
    <div class="panel-title"><div><h2>Фильтрация рекламы — AdGuard Home</h2><span>Фильтрация на уровне DNS. Реклама с того же домена, что и контент, может оставаться.</span></div>
      <div class="split-actions adguard-header-actions">${adminUrl ? `<a class="btn secondary" href="${escapeHtml(adminUrl)}" target="_blank" rel="noopener noreferrer">Открыть AdGuard Home ↗</a>` : ''}
      <button class="btn secondary" data-action="adguardRefresh" ${busy ? 'disabled' : ''}>Обновить статус</button></div></div>
    ${status.error ? `<p class="settings-warning">${escapeHtml(status.error)}</p>` : ''}
    ${['doh-vpn', 'doh-direct'].includes(chain.dnsPath) ? `<div class="settings-warning ${chain.dnsPath === 'doh-direct' || chain.relayReady ? 'ok' : ''}"><strong>${chain.dnsPath === 'doh-direct' ? 'AdGuard → DoH напрямую' : 'AdGuard → DoH → Xray'}</strong><span>${escapeHtml(chain.hint)}</span></div>` : ''}
    ${status.configured ? `<div class="dns-overview">
      <article class="${status.running ? 'is-ok' : 'is-warn'}"><span>AdGuard Home</span><strong>${status.running ? 'Работает' : 'Не отвечает'}</strong></article>
      <article class="${status.protectionEnabled && status.filteringEnabled ? 'is-ok' : 'is-warn'}"><span>Фильтрация</span><strong>${status.protectionEnabled && status.filteringEnabled ? 'Включена' : 'Выключена'}</strong></article>
      <article><span>Запросы за период AdGuard</span><strong>${Number(status.queries) || 0}</strong></article>
      <article><span>Заблокировано</span><strong>${Number(status.blocked) || 0}</strong></article>
    </div>
    <p class="muted">Активных списков: ${Number(status.filters) || 0}. Версия: ${escapeHtml(status.version || '—')}.</p>
    <button class="btn ${status.protectionEnabled ? 'secondary' : 'primary'}" data-action="adguardProtection" ${disabled ? 'disabled' : ''}>${status.protectionEnabled ? 'Выключить фильтрацию' : 'Включить фильтрацию'}</button>` : '<p class="muted">Подключите установленный на роутере AdGuard Home. Это не меняет DNS устройств и не устанавливает новый сервис.</p>'}
    ${dnsClientJournal(state)}
    ${adguardUpstreamsSection(state, escapeHtml)}
    <div class="panel-title"><div><h3>Проверить домен и добавить исключение</h3><span>Исключение действует на домен и его поддомены.</span></div></div>
    <label class="field"><span>Домен</span><input id="adguardDomain" value="${escapeHtml(state.adguardDomain || '')}" placeholder="example.com" autocomplete="off"></label>
    <div class="form-actions">
      <button class="btn secondary" data-action="adguardCheck" ${disabled ? 'disabled' : ''}>Проверить фильтр</button>
      <button class="btn primary" data-action="adguardExceptionAdd" ${disabled ? 'disabled' : ''}>Разрешить домен</button>
      <button class="btn secondary" data-action="adguardExceptionRemove" ${disabled ? 'disabled' : ''}>Удалить исключение</button>
    </div>
    ${state.adguardCheckResult ? `<p class="settings-warning"><strong>${escapeHtml(state.adguardCheckResult.domain)}</strong><span>${escapeHtml(filteringReason(state.adguardCheckResult.result?.reason))}${state.adguardCheckResult.result?.rules?.length ? ` · ${escapeHtml(state.adguardCheckResult.result.rules.map((rule) => rule.text).join(', '))}` : ''}</span>${status.configured && !status.protectionEnabled ? '<span>Защита AdGuard сейчас выключена; блокировки не применяются.</span>' : ''}</p>` : ''}
    <details class="lan-dns-details" ${status.configured ? '' : 'open'}><summary><span><strong>Подключение и запуск VPN</strong><em>${status.enabled ? 'Bootstrap синхронизируется автоматически' : 'Автоматическая синхронизация отключена'}</em></span></summary>
      <div class="lan-dns-details-body">
        <p>Имена VPN-серверов из активной конфигурации и сохранённых профилей разрешаются через отдельный DoH даже при остановленном VPN. Это позволяет восстановить соединение после перезагрузки.</p>
        <label class="field"><span>Локальный API AdGuard Home</span><input id="adguardUrl" value="${escapeHtml(state.adguardUrl || status.url || 'http://127.0.0.1:3001')}" placeholder="http://127.0.0.1:3001"></label>
        <label class="field"><span>Пользователь</span><input id="adguardUsername" value="${escapeHtml(state.adguardUsername ?? status.username ?? 'admin')}" autocomplete="username"></label>
        <label class="field"><span>Пароль ${status.configured ? '(пусто — сохранить текущий)' : ''}</span><input id="adguardPassword" type="password" autocomplete="new-password"></label>
        <label class="field"><span>DoH для запуска VPN — по одному IP URL на строку</span><textarea id="adguardBootstrap">${escapeHtml(state.adguardBootstrap ?? (status.bootstrapDns || ['https://8.8.8.8/dns-query', 'https://1.1.1.1/dns-query']).join('\n'))}</textarea></label>
        <label class="check"><input id="adguardSyncEnabled" type="checkbox" ${(state.adguardSyncEnabled ?? status.enabled ?? true) ? 'checked' : ''}> Синхронизировать DNS для серверов VPN</label>
        <p class="muted">При отключении автоматизации последний список DNS для VPN сохраняется, чтобы соединение восстановилось после перезагрузки. Новые серверы потребуют повторного включения синхронизации. Пароль хранится на роутере и не входит в экспорт профилей.</p>
        <div class="form-actions"><button class="btn primary" data-action="adguardConfigure" ${busy ? 'disabled' : ''}>Сохранить подключение</button><button class="btn secondary" data-action="adguardSync" ${disabled || !status.enabled ? 'disabled' : ''}>Синхронизировать сейчас</button></div>
        <p class="muted">VPN bootstrap: ${escapeHtml((status.domains || []).join(', ') || 'Нет доменов')}.</p>
      </div></details>
  </section>`;
}
