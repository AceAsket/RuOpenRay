export function adguardSection(state, escapeHtml) {
  const status = state.adguardStatus || {};
  const busy = String(state.busyAction || '').startsWith('adguard');
  const disabled = busy || !status.configured || !status.ok;
  const chain = state.lanDnsStatus?.adguardHome || {};
  return `<section class="panel settings-section">
    <div class="panel-title"><div><h2>Фильтрация рекламы — AdGuard Home</h2><span>Фильтрация на уровне DNS. Реклама с того же домена, что и контент, может оставаться.</span></div>
      <button class="btn secondary" data-action="adguardRefresh" ${busy ? 'disabled' : ''}>Обновить статус</button></div>
    ${status.error ? `<p class="settings-warning">${escapeHtml(status.error)}</p>` : ''}
    ${chain.dnsPath === 'doh-vpn' ? `<div class="settings-warning ${chain.relayReady ? 'ok' : ''}"><strong>AdGuard → DoH → Xray</strong><span>${escapeHtml(chain.hint)}</span></div>` : ''}
    ${status.configured ? `<div class="dns-overview">
      <article class="${status.running ? 'is-ok' : 'is-warn'}"><span>AdGuard Home</span><strong>${status.running ? 'Работает' : 'Не отвечает'}</strong></article>
      <article class="${status.protectionEnabled && status.filteringEnabled ? 'is-ok' : 'is-warn'}"><span>Фильтрация</span><strong>${status.protectionEnabled && status.filteringEnabled ? 'Включена' : 'Выключена'}</strong></article>
      <article><span>Запросы за период AdGuard</span><strong>${Number(status.queries) || 0}</strong></article>
      <article><span>Заблокировано</span><strong>${Number(status.blocked) || 0}</strong></article>
    </div>
    <p class="muted">Активных списков: ${Number(status.filters) || 0}. Версия: ${escapeHtml(status.version || '—')}.</p>
    <button class="btn ${status.protectionEnabled ? 'secondary' : 'primary'}" data-action="adguardProtection" ${disabled ? 'disabled' : ''}>${status.protectionEnabled ? 'Выключить фильтрацию' : 'Включить фильтрацию'}</button>` : '<p class="muted">Подключите установленный на роутере AdGuard Home. Это не меняет DNS устройств и не устанавливает новый сервис.</p>'}
    <div class="panel-title"><div><h3>Проверить домен и добавить исключение</h3><span>Исключение действует на домен и его поддомены.</span></div></div>
    <label class="field"><span>Домен</span><input id="adguardDomain" value="${escapeHtml(state.adguardDomain || '')}" placeholder="example.com" autocomplete="off"></label>
    <div class="form-actions">
      <button class="btn secondary" data-action="adguardCheck" ${disabled ? 'disabled' : ''}>Проверить фильтр</button>
      <button class="btn primary" data-action="adguardExceptionAdd" ${disabled ? 'disabled' : ''}>Разрешить домен</button>
      <button class="btn secondary" data-action="adguardExceptionRemove" ${disabled ? 'disabled' : ''}>Удалить исключение</button>
    </div>
    ${state.adguardCheckResult ? `<p class="settings-warning"><strong>${escapeHtml(state.adguardCheckResult.domain)}</strong><span>${escapeHtml(state.adguardCheckResult.result?.reason || 'Нет результата')}${state.adguardCheckResult.result?.rules?.length ? ` · ${escapeHtml(state.adguardCheckResult.result.rules.map((rule) => rule.text).join(', '))}` : ''}</span></p>` : ''}
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
