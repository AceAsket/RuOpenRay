export function createCompatView({ state, escapeHtml }) {
  function serviceStateLabel(item = {}) {
    if (item.active) return 'активен';
    if (item.running) return 'запущен';
    if (item.available) return 'найден';
    return 'не найден';
  }

  function serviceTone(item = {}) {
    if (item.active || item.running) return 'ok';
    if (item.available) return 'warn';
    return '';
  }

  function externalLink(url, label) {
    if (!url) return '';
    return `<a class="btn secondary" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  }

  function commandButton(action, label, attrs = '') {
    const busy = state.busyAction === action;
    return `<button class="btn secondary ${busy ? 'is-busy' : ''}" data-action="${escapeHtml(action)}" ${busy ? 'disabled' : ''} ${attrs}>${escapeHtml(busy ? 'Выполняю...' : label)}</button>`;
  }

  function b4Button(action, label, tone = 'secondary') {
    const busy = state.busyAction === `controlB4:${action}`;
    return `<button class="btn ${tone} ${busy ? 'is-busy' : ''}" data-action="controlB4" data-b4-action="${escapeHtml(action)}" ${busy ? 'disabled' : ''}>${escapeHtml(busy ? 'Выполняю...' : label)}</button>`;
  }

  function adguardCard(compat = {}) {
    const item = compat.adguardHome || {};
    const found = Boolean(item.available || item.configPath);
    return `<article class="compat-card ${serviceTone(item)} ${found ? '' : 'muted-card'}">
      <div class="compat-card-head">
        <div>
          <span class="eyebrow">AdGuard Home</span>
          <h2>${escapeHtml(found ? serviceStateLabel(item) : 'не найден')}</h2>
          <p>${escapeHtml(item.hint || (found ? 'Локальный DNS-фильтр найден на роутере.' : 'RuOpenRay не нашел AdGuard Home на этом роутере.'))}</p>
        </div>
        <span class="status-chip ${item.running ? 'ok' : ''}">${escapeHtml(item.running ? 'запущен' : (found ? 'остановлен' : 'нет'))}</span>
      </div>
      <div class="compat-metrics">
        <article><span>Слушает</span><strong>${escapeHtml(item.listen || (item.port ? `:${item.port}` : 'неизвестно'))}</strong></article>
        <article><span>Upstream</span><strong>${escapeHtml(item.usesXray ? 'через Xray' : (found ? 'не через Xray' : 'нет'))}</strong></article>
        <article><span>Конфиг</span><strong>${escapeHtml(item.configPath || 'не найден')}</strong></article>
      </div>
      <div class="split-actions">
        ${externalLink(compat.links?.adguardHome, 'Открыть AdGuard')}
        <button class="btn secondary" data-tab-jump="dns">DNS-совместимость</button>
      </div>
    </article>`;
  }

  function podkopCard(compat = {}) {
    const item = compat.podkop || {};
    const found = Boolean(item.available || item.active || item.running);
    return `<article class="compat-card ${serviceTone(item)} ${found ? '' : 'muted-card'}">
      <div class="compat-card-head">
        <div>
          <span class="eyebrow">Podkop</span>
          <h2>${escapeHtml(serviceStateLabel(item))}</h2>
          <p>${escapeHtml(item.summary || 'Проверяет признаки Podkop: DNS, nftables, TPROXY и policy routing.')}</p>
        </div>
        <span class="status-chip ${item.active ? 'warn' : ''}">${escapeHtml(item.active ? 'влияет на перехват' : (found ? 'без следов' : 'нет'))}</span>
      </div>
      <div class="compat-metrics">
        <article><span>DNS</span><strong>${escapeHtml(item.dnsmasq?.usesPodkopDNS ? 'dnsmasq → Podkop' : 'не найдено')}</strong></article>
        <article><span>nftables</span><strong>${escapeHtml(item.nft?.active ? 'таблица активна' : 'нет таблицы')}</strong></article>
        <article><span>Policy routing</span><strong>${escapeHtml(item.routing?.ipRule || item.routing?.route ? 'найден' : 'не найден')}</strong></article>
      </div>
      <div class="split-actions">
        ${externalLink(compat.links?.podkop, 'Открыть Podkop')}
        <button class="btn secondary" data-tab-jump="diagnostics">Диагностика</button>
      </div>
    </article>`;
  }

  function b4Card(compat = {}) {
    const item = compat.b4 || {};
    const found = Boolean(item.available || item.active || item.running);
    const enabled = Boolean(item.service?.enabled);
    return `<article class="compat-card ${serviceTone(item)} ${found ? '' : 'muted-card'}">
      <div class="compat-card-head">
        <div>
          <span class="eyebrow">B4</span>
          <h2>${escapeHtml(serviceStateLabel(item))}</h2>
          <p>${escapeHtml(item.summary || 'Проверяет B4 API, процесс, nftables NFQUEUE и policy routing.')}</p>
        </div>
        <span class="status-chip ${item.active ? 'warn' : (item.running ? 'ok' : '')}">${escapeHtml(item.active ? 'NFQUEUE активен' : (item.running ? 'API/process' : (enabled ? 'автозапуск' : 'остановлен')))}</span>
      </div>
      <div class="compat-metrics">
        <article><span>API</span><strong>${escapeHtml(item.api?.available ? (item.api.summary || 'отвечает') : 'не отвечает')}</strong></article>
        <article><span>Сервис</span><strong>${escapeHtml(item.running ? 'запущен' : 'остановлен')}</strong></article>
        <article><span>Автозапуск</span><strong>${escapeHtml(enabled ? 'включен' : 'выключен')}</strong></article>
        <article><span>nft/NFQUEUE</span><strong>${escapeHtml(item.nft?.hasQueue ? 'найден' : 'не найден')}</strong></article>
      </div>
      <div class="split-actions compat-actions">
        ${externalLink(compat.links?.b4, 'Открыть B4')}
        ${b4Button('start', 'Запустить', 'secondary')}
        ${b4Button('stop', 'Остановить', 'secondary')}
        ${enabled ? b4Button('disable', 'Убрать автозапуск', 'secondary') : b4Button('enable', 'Включить автозапуск', 'secondary')}
        ${b4Button('restart', 'Перезапустить', 'secondary')}
        ${b4Button('clear', 'Очистить таблицы', 'danger')}
      </div>
    </article>`;
  }

  function compatPanel() {
    const routerLan = state.compatStatus?.routerLan || state.lanDnsStatus?.routerLan || '192.168.1.1';
    const adguardFallback = state.lanDnsStatus?.adguardHome || {};
    const adguardPort = Number(adguardFallback.webPort || 3000) || 3000;
    const compat = state.compatStatus || {
      adguardHome: state.lanDnsStatus?.adguardHome || {},
      podkop: state.status?.podkop || {},
      b4: state.status?.b4 || {},
      links: {
        adguardHome: `http://${routerLan}:${adguardPort}/`,
        podkop: `http://${routerLan}/cgi-bin/luci/admin/services/podkop`,
        b4: `http://${routerLan}:7000/`
      }
    };
    const detected = Boolean(
      compat.adguardHome?.available || compat.adguardHome?.configPath ||
      compat.podkop?.available || compat.podkop?.active ||
      compat.b4?.available || compat.b4?.active || compat.b4?.running
    );
    return `<section class="panel compat-panel">
      <div class="panel-title">
        <div>
          <h2>Сторонние сервисы</h2>
          <span>AdGuard Home, Podkop и B4 могут управлять DNS, nftables или DPI-обходом рядом с RuOpenRay.</span>
        </div>
        <div class="split-actions">
          ${commandButton('refreshCompatibility', 'Обновить')}
          ${commandButton('stopRuOpenRayMode', 'Остановить RuOpenRay')}
        </div>
      </div>
      ${detected ? '' : `<div class="empty-state">Сторонние сервисы пока не найдены. Когда RuOpenRay обнаружит AdGuard Home, Podkop или B4, здесь появятся быстрые действия.</div>`}
      <div class="compat-grid">
        ${adguardCard(compat)}
        ${podkopCard(compat)}
        ${b4Card(compat)}
      </div>
    </section>`;
  }

  return { compatPanel };
}
