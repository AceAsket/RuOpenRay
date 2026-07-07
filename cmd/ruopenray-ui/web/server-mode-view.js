export function createServerModeView({ state, escapeHtml }) {
  const array = (value) => Array.isArray(value) ? value : [];
  const byteSize = (value = 0) => {
    const bytes = Number(value || 0);
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${Math.max(0, Math.round(bytes))} B`;
  };
  const byteRate = (value = 0) => `${byteSize(value)}/s`;

  function draft() {
    return state.serverModeDraft || state.serverMode?.config || { enabled: false, xray: [], awg: [] };
  }

  function outbounds() {
    const fromReport = array(state.serverMode?.outbounds).map((item) => item?.tag).filter(Boolean);
    const fromConfig = array(state.config?.outbounds).map((item) => item?.tag).filter(Boolean);
    return [...new Set(['direct', 'block', ...fromReport, ...fromConfig])]
      .filter((tag) => tag && !String(tag).startsWith('ruopenray-server-'));
  }

  function outboundSelect(path, value = 'direct') {
    const options = outbounds().map((tag) => `<option value="${escapeHtml(tag)}" ${tag === value ? 'selected' : ''}>${escapeHtml(tag)}</option>`).join('');
    return `<select class="input" data-server-mode-field="${escapeHtml(path)}">${options}</select>`;
  }

  function textInput(path, value = '', attrs = '') {
    return `<input class="input" data-server-mode-field="${escapeHtml(path)}" value="${escapeHtml(value || '')}" ${attrs}>`;
  }

  function numberInput(path, value = 0, attrs = '') {
    return `<input class="input" type="number" data-server-mode-number="1" data-server-mode-field="${escapeHtml(path)}" value="${escapeHtml(value || 0)}" ${attrs}>`;
  }

  function checkbox(path, checked = false, label = '') {
    return `<label class="settings-check server-mode-check">
      <input type="checkbox" data-server-mode-field="${escapeHtml(path)}" ${checked ? 'checked' : ''}>
      <span><strong>${escapeHtml(label)}</strong></span>
    </label>`;
  }

  function issueList(preflight = {}) {
    const errors = array(preflight.errors);
    const warnings = array(preflight.warnings);
    const items = [...errors, ...warnings];
    if (!items.length) {
      return `<div class="notice ok"><strong>Проверка чистая</strong><span>Критичных проблем server-mode пока не найдено.</span></div>`;
    }
    return `<div class="server-mode-issues">
      ${items.map((issue) => `<article class="${escapeHtml(issue.severity || 'warning')}">
        <strong>${escapeHtml(issue.title || 'Проверка')}</strong>
        <span>${escapeHtml(issue.detail || '')}</span>
        ${issue.source ? `<code>${escapeHtml(issue.source)}</code>` : ''}
      </article>`).join('')}
    </div>`;
  }

  function clientCard(inbound, inboundIndex, client, clientIndex) {
    const base = `xray.${inboundIndex}.clients.${clientIndex}`;
    return `<article class="server-mode-client">
      <div class="server-mode-client-head">
        ${checkbox(`${base}.enabled`, client.enabled, client.name || `Клиент ${clientIndex + 1}`)}
        <button class="icon-btn danger" type="button" data-action="deleteServerModeClient" data-server-mode-inbound="${inboundIndex}" data-server-mode-client="${clientIndex}" title="Удалить клиента">×</button>
      </div>
      <div class="server-mode-grid">
        <label><span>Имя</span>${textInput(`${base}.name`, client.name)}</label>
        <label><span>UUID</span>${textInput(`${base}.uuid`, client.uuid, 'spellcheck="false"')}</label>
        <label><span>User / email</span>${textInput(`${base}.email`, client.email, 'spellcheck="false"')}</label>
        <label><span>Куда отправлять</span>${outboundSelect(`${base}.egressTag`, client.egressTag || 'direct')}</label>
        <label><span>Flow</span>${textInput(`${base}.flow`, client.flow || 'xtls-rprx-vision', 'spellcheck="false"')}</label>
        <label><span>Level</span>${numberInput(`${base}.level`, client.level || 0, 'min="0" max="255"')}</label>
      </div>
      <div class="server-mode-policy-row">
        ${checkbox(`${base}.allowLan`, client.allowLan, 'Разрешить LAN')}
        ${checkbox(`${base}.allowDns`, client.allowDns, 'Разрешить DNS/53')}
        ${checkbox(`${base}.allowRouter`, client.allowRouter, 'Разрешить роутер')}
      </div>
    </article>`;
  }

  function inboundCard(inbound, index) {
    const base = `xray.${index}`;
    const clients = array(inbound.clients);
    return `<article class="server-mode-inbound">
      <div class="server-mode-inbound-head">
        <div>
          <span class="eyebrow">XRAY SERVER</span>
          <h3>${escapeHtml(inbound.name || `Вход ${index + 1}`)}</h3>
          <p>${escapeHtml(`${inbound.listen || '0.0.0.0'}:${inbound.port || 443} · ${inbound.protocol || 'vless'} · ${inbound.security || 'reality'}`)}</p>
        </div>
        <div class="server-mode-row-actions">
          <button class="btn secondary compact" type="button" data-action="generateServerModeRealityKey" data-server-mode-inbound="${index}">Ключ Reality</button>
          <button class="btn secondary compact" type="button" data-action="addServerModeClient" data-server-mode-inbound="${index}">Добавить клиента</button>
          <button class="icon-btn danger" type="button" data-action="deleteServerModeInbound" data-server-mode-inbound="${index}" title="Удалить вход">×</button>
        </div>
      </div>
      ${checkbox(`${base}.enabled`, inbound.enabled, 'Вход включен')}
      <div class="server-mode-grid">
        <label><span>Название</span>${textInput(`${base}.name`, inbound.name)}</label>
        <label><span>Listen</span>${textInput(`${base}.listen`, inbound.listen || '0.0.0.0', 'spellcheck="false"')}</label>
        <label><span>Порт</span>${numberInput(`${base}.port`, inbound.port || 443, 'min="1" max="65535"')}</label>
        <label><span>Security</span>
          <select class="input" data-server-mode-field="${base}.security">
            ${['reality', 'tls', 'none'].map((value) => `<option value="${value}" ${value === inbound.security ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="server-mode-grid">
        <label><span>Reality dest</span>${textInput(`${base}.reality.dest`, inbound.reality?.dest || 'www.microsoft.com:443', 'spellcheck="false"')}</label>
        <label><span>Server names</span>${textInput(`${base}.reality.serverNames`, array(inbound.reality?.serverNames).join(', '), 'data-server-mode-list="1" spellcheck="false"')}</label>
        <label><span>Private key</span>${textInput(`${base}.reality.privateKey`, inbound.reality?.privateKey || '', 'spellcheck="false"')}</label>
        <label><span>Short IDs</span>${textInput(`${base}.reality.shortIds`, array(inbound.reality?.shortIds).join(', '), 'data-server-mode-list="1" spellcheck="false"')}</label>
      </div>
      <div class="server-mode-policy-row">
        ${checkbox(`${base}.sniffing`, inbound.sniffing, 'Sniffing routeOnly')}
        ${checkbox(`${base}.openFirewall`, inbound.openFirewall, 'Планировать WAN firewall')}
      </div>
      <div class="server-mode-clients">
        ${clients.length ? clients.map((client, clientIndex) => clientCard(inbound, index, client, clientIndex)).join('') : '<div class="empty-state">Клиентов пока нет.</div>'}
      </div>
    </article>`;
  }

  function awgPeerCard(serverIndex, peer, peerIndex) {
    const base = `awg.${serverIndex}.peers.${peerIndex}`;
    return `<article class="server-mode-client">
      <div class="server-mode-client-head">
        ${checkbox(`${base}.enabled`, peer.enabled, peer.name || `Peer ${peerIndex + 1}`)}
        <button class="icon-btn danger" type="button" data-action="deleteServerModeAWGPeer" data-server-mode-awg="${serverIndex}" data-server-mode-peer="${peerIndex}" title="Удалить peer">×</button>
      </div>
      <div class="server-mode-grid">
        <label><span>Имя</span>${textInput(`${base}.name`, peer.name)}</label>
        <label><span>Public key</span>${textInput(`${base}.publicKey`, peer.publicKey, 'spellcheck="false"')}</label>
        <label><span>Allowed IPs</span>${textInput(`${base}.allowedIps`, peer.allowedIps || '10.70.0.2/32', 'spellcheck="false"')}</label>
        <label><span>Preshared key</span>${textInput(`${base}.presharedKey`, peer.presharedKey || '', 'spellcheck="false"')}</label>
      </div>
    </article>`;
  }

  function awgCard(server, index) {
    const base = `awg.${index}`;
    const peers = array(server.peers);
    return `<article class="server-mode-inbound server-mode-awg">
      <div class="server-mode-inbound-head">
        <div>
          <span class="eyebrow">AMNEZIAWG SERVER</span>
          <h3>${escapeHtml(server.name || `AWG вход ${index + 1}`)}</h3>
          <p>${escapeHtml(`${server.interface || 'awg-server0'} · udp/${server.listenPort || 51820} · ${server.addressCidr || '10.70.0.1/24'}`)}</p>
        </div>
        <div class="server-mode-row-actions">
          <button class="btn secondary compact" type="button" data-action="addServerModeAWGPeer" data-server-mode-awg="${index}">Добавить peer</button>
          <button class="icon-btn danger" type="button" data-action="deleteServerModeAWGServer" data-server-mode-awg="${index}" title="Удалить AWG сервер">×</button>
        </div>
      </div>
      ${checkbox(`${base}.enabled`, server.enabled, 'AWG сервер включен в плане')}
      <div class="notice warn compact"><strong>Пока без применения интерфейса</strong><span>RuOpenRay сохранит и проверит схему AWG, но не будет поднимать интерфейс и открывать WAN-порт до отдельного безопасного шага.</span></div>
      <div class="server-mode-grid">
        <label><span>Название</span>${textInput(`${base}.name`, server.name)}</label>
        <label><span>Interface</span>${textInput(`${base}.interface`, server.interface || 'awg-server0', 'spellcheck="false"')}</label>
        <label><span>UDP порт</span>${numberInput(`${base}.listenPort`, server.listenPort || 51820, 'min="1" max="65535"')}</label>
        <label><span>Адрес интерфейса</span>${textInput(`${base}.addressCidr`, server.addressCidr || '10.70.0.1/24', 'spellcheck="false"')}</label>
        <label><span>MTU</span>${numberInput(`${base}.mtu`, server.mtu || 1420, 'min="576" max="9000"')}</label>
        <label><span>Куда отправлять</span>${outboundSelect(`${base}.egressTag`, server.egressTag || 'direct')}</label>
        <label><span>Private key</span>${textInput(`${base}.privateKey`, server.privateKey || '', 'spellcheck="false"')}</label>
        <label><span>Public key</span>${textInput(`${base}.publicKey`, server.publicKey || '', 'spellcheck="false"')}</label>
      </div>
      <div class="server-mode-policy-row">
        ${checkbox(`${base}.allowLan`, server.allowLan, 'Разрешить LAN для peers')}
        ${checkbox(`${base}.openFirewall`, server.openFirewall, 'Планировать WAN firewall')}
      </div>
      <div class="server-mode-clients">
        ${peers.length ? peers.map((peer, peerIndex) => awgPeerCard(index, peer, peerIndex)).join('') : '<div class="empty-state">Peers пока нет.</div>'}
      </div>
    </article>`;
  }

  function managedStats() {
    const managed = state.serverMode?.managed || state.serverModePreview?.summary || {};
    return `<div class="grid four">
      <article class="stat"><span>Входы</span><strong>${escapeHtml(managed.inbounds ?? 0)}</strong><small>managed Xray</small></article>
      <article class="stat"><span>Клиенты</span><strong>${escapeHtml(managed.clients ?? 0)}</strong><small>VLESS users</small></article>
      <article class="stat"><span>Маршруты</span><strong>${escapeHtml(managed.routingRules ?? 0)}</strong><small>user-policy rules</small></article>
      <article class="stat"><span>Outbounds</span><strong>${escapeHtml(managed.outbounds ?? 0)}</strong><small>служебные deny</small></article>
    </div>`;
  }

  function clientTrafficPanel() {
    const clients = array(state.serverMode?.clients);
    const stats = state.serverMode?.xrayStats || {};
    if (!clients.length) return '';
    return `<section class="server-mode-traffic">
      <div class="server-mode-traffic-head">
        <div>
          <h3>Мониторинг клиентов</h3>
          <p>${stats.enabled === true ? 'Xray user stats включены: клиенты считаются по email/user.' : 'Статистика клиентов появится после применения server-mode и перезапуска Xray.'}</p>
        </div>
        <span class="pill ${stats.enabled === true ? 'ok' : 'muted'}">${stats.enabled === true ? 'stats включены' : 'stats выключены'}</span>
      </div>
      <div class="server-mode-traffic-list">
        ${clients.map((client) => `<article>
          <div>
            <strong>${escapeHtml(client.name || client.email || 'Клиент')}</strong>
            <span>${escapeHtml(`${client.inboundName || client.inboundId || 'вход'} → ${client.egressTag || 'direct'}`)}</span>
          </div>
          <div>
            <strong>${escapeHtml(client.status || 'ждем трафик')}</strong>
            <span>${escapeHtml(`${byteSize(client.downlink)} принято · ${byteSize(client.uplink)} отправлено`)}</span>
          </div>
          <div>
            <strong>${escapeHtml(`${byteRate(client.downRate)} прием`)}</strong>
            <span>${escapeHtml(`${byteRate(client.upRate)} отдача`)}</span>
          </div>
        </article>`).join('')}
      </div>
    </section>`;
  }

  function serverModePanel() {
    const model = draft();
    const preflight = state.serverModePreflight || state.serverMode?.preflight || {};
    const xray = array(model.xray);
    const awg = array(model.awg);
    const preview = state.serverModePreview;
    return `<section class="panel server-mode-panel">
      <div class="section-head">
        <div>
          <h2>Входящие подключения</h2>
          <p>RuOpenRay может принимать внешних клиентов Xray, выдавать каждому свою политику доступа и отправлять их трафик в выбранный outbound.</p>
        </div>
        <div class="actions">
          <button class="btn secondary" type="button" data-action="refreshServerMode">Обновить</button>
          <button class="btn secondary" type="button" data-action="previewServerMode">Preview</button>
          <button class="btn warning" type="button" data-action="saveServerMode">Сохранить</button>
          <button class="btn" type="button" data-action="applyServerMode">Записать в Xray</button>
        </div>
      </div>
      <div class="server-mode-hero">
        ${checkbox('enabled', model.enabled, 'Серверный режим включен')}
        ${checkbox('monitorClients', model.monitorClients !== false, 'Мониторить клиентов')}
        <p>По умолчанию внешний клиент не получает доступ к LAN и DNS-порту роутера. Доступ открывается только явными галочками на клиенте.</p>
      </div>
      ${managedStats()}
      ${clientTrafficPanel()}
      ${issueList(preflight)}
      <div class="server-mode-toolbar">
        <button class="btn secondary" type="button" data-action="addServerModeXrayInbound">Добавить Xray вход</button>
        <button class="btn secondary" type="button" data-action="addServerModeAWGServer">Добавить AWG сервер</button>
      </div>
      <div class="server-mode-list">
        ${xray.length ? xray.map((inbound, index) => inboundCard(inbound, index)).join('') : '<article class="empty-state">Входов пока нет. Добавьте Reality-вход, затем клиента и выход для его трафика.</article>'}
        ${awg.length ? awg.map((server, index) => awgCard(server, index)).join('') : ''}
      </div>
      ${preview ? `<div class="notice ${preview.ok ? 'ok' : 'warn'}"><strong>${preview.ok ? 'Preview готов' : 'Preview требует внимания'}</strong><span>${escapeHtml(preview.error || preview.restart?.message || 'Xray config был проверен без перезапуска сервиса.')}</span></div>` : ''}
    </section>`;
  }

  return { serverModePanel };
}
