// Shared line icons keep the navigation and connection overview consistent.
export function interfaceIcon(name, className = '') {
  const paths = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    setup: '<path d="m14 3 7 7-11 11-7-7L14 3Z"/><path d="m11 6 7 7M4 3v4M2 5h4M19 17v4M17 19h4"/>',
    servers: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>',
    serverMode: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',
    routing: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 12h4M11 5h6M11 19h6M11 5v14"/>',
    dns: '<path d="M12 3 3 7l9 4 9-4-9-4ZM3 12l9 4 9-4M3 17l9 4 9-4"/>',
    diagnostics: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    profiles: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 4V2M16 4V2M8 10h8M8 15h5"/>',
    settings: '<path d="M9.02 4.79L10.09 2.18L13.91 2.18L14.98 4.79L17.59 3.71L20.29 6.41L19.21 9.02L21.82 10.09L21.82 13.91L19.21 14.98L20.29 17.59L17.59 20.29L14.98 19.21L13.91 21.82L10.09 21.82L9.02 19.21L6.41 20.29L3.71 17.59L4.79 14.98L2.18 13.91L2.18 10.09L4.79 9.02L3.71 6.41L6.41 3.71L9.02 4.79Z"/><circle cx="12" cy="12" r="3.25"/>',
    amnezia: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    compat: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M14 6h4v4M6 14v4h4"/>',
    devices: '<rect x="2" y="3" width="14" height="11" rx="2"/><path d="M9 14v4M5 18h8"/><rect x="17" y="10" width="5" height="11" rx="1"/>',
    router: '<rect x="3" y="11" width="18" height="9" rx="2"/><path d="M7 11V4M17 11V4M7 16h.01M11 16h.01M16 16h2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
    moon: '<path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>',
    grip: '<g fill="currentColor" stroke="none"><circle cx="8" cy="5" r="1.4"/><circle cx="16" cy="5" r="1.4"/><circle cx="8" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/><circle cx="8" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/></g>',
  };
  return `<svg class="${className}" width="24" height="24" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.servers}</svg>`;
}

export function navigationView(items, activeTab) {
  const groups = [
    ['Обзор', ['dashboard', 'setup']],
    ['Сеть и VPN', ['servers', 'amnezia', 'serverMode', 'routing', 'dns']],
    ['Управление', ['profiles', 'compat', 'diagnostics', 'settings']],
  ];
  return groups.map(([label, keys]) => {
    const entries = keys.map((key) => items.find(([itemKey]) => itemKey === key)).filter(Boolean);
    if (!entries.length) return '';
    return `<div class="nav-group"><div class="nav-group-label">${label}</div>${entries.map(([key, title]) => `<button type="button" class="${key === activeTab ? 'active' : ''}" data-tab="${key}" ${key === activeTab ? 'aria-current="page"' : ''}>${interfaceIcon(key, 'nav-icon')}<span class="nav-label">${title}</span></button>`).join('')}</div>`;
  }).join('');
}
