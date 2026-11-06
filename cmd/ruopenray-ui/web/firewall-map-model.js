export const firewallMapHooks = [
  ['prerouting', 'Входящий пакет'], ['input', 'На роутер'], ['forward', 'Через роутер'],
  ['output', 'От роутера'], ['postrouting', 'Перед выходом']
];
export const firewallMapScenarios = {
  forward: { label: 'LAN → Интернет', hooks: ['prerouting', 'forward', 'postrouting'] },
  input: { label: 'LAN → роутер', hooks: ['prerouting', 'input'] },
  output: { label: 'Роутер → Интернет', hooks: ['output', 'postrouting'] }
};

export function firewallMapChains(snapshot, family = 'ip') {
  const chains = Array.isArray(snapshot?.chains) ? snapshot.chains : [];
  return chains.filter((chain) => family === 'all' || chain.family === 'inet' || chain.family === family);
}

export function firewallMapBases(chains, hook) {
  return chains.filter((chain) => chain.hook === hook).sort((a, b) => {
    const priority = (c) => typeof c.priority === 'number' && Number.isFinite(c.priority) ? c.priority : Infinity;
    return priority(a) - priority(b) || `${a.family}/${a.table}/${a.name}`.localeCompare(`${b.family}/${b.table}/${b.name}`);
  });
}

export function firewallMapSelection(state) {
  const family = ['ip', 'ip6', 'all'].includes(state.firewallMapFamily) ? state.firewallMapFamily : 'ip';
  const hook = firewallMapHooks.some(([key]) => key === state.firewallMapHook) ? state.firewallMapHook : 'prerouting';
  const chains = firewallMapChains(state.firewallMap, family);
  const bases = firewallMapBases(chains, hook);
  const selected = chains.find((chain) => chain.id === state.firewallMapChain)
    || bases.find((chain) => chain.table === 'ruopenray') || bases[0] || chains[0];
  const scenario = firewallMapScenarios[state.firewallMapScenario] || firewallMapScenarios.forward;
  return { family, hook, chains, bases, selected, scenario };
}

const fieldLabels = {
  iifname: 'Входящий интерфейс', oifname: 'Исходящий интерфейс', l4proto: 'Протокол', nfproto: 'Семейство',
  mark: 'Метка пакета', skuid: 'UID процесса', iif: 'Входящий интерфейс', oif: 'Исходящий интерфейс'
};
const payloadLabels = { saddr: 'Адрес источника', daddr: 'Адрес назначения', sport: 'Порт источника', dport: 'Порт назначения' };
const short = (text, max = 320) => text.length > max ? `${text.slice(0, max)}…` : text;

export function firewallMapValue(value, depth = 0) {
  if (depth > 8) return '…';
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'object') return String(value);
  const nested = (item) => firewallMapValue(item, depth + 1);
  if (Array.isArray(value)) return short(value.slice(0, 6).map(nested).join(', ') + (value.length > 6 ? ` · ещё ${value.length - 6}` : ''));
  if (value.meta && typeof value.meta === 'object' && value.meta.key) return fieldLabels[value.meta.key] || `meta ${value.meta.key}`;
  if (value.payload && typeof value.payload === 'object' && value.payload.field) return payloadLabels[value.payload.field] || `${value.payload.protocol}.${value.payload.field}`;
  if (value.ct && typeof value.ct === 'object' && value.ct.key) return value.ct.key === 'state' ? 'Состояние соединения' : value.ct.key === 'mark' ? 'Метка соединения' : `ct ${value.ct.key}`;
  if (value.prefix && typeof value.prefix === 'object' && value.prefix.addr !== undefined) return `${value.prefix.addr}/${value.prefix.len}`;
  if (Array.isArray(value.range)) return value.range.map(nested).join('–');
  if (value.set) return `{ ${nested(value.set)} }`;
  if (Array.isArray(value.concat)) return value.concat.map(nested).join(' · ');
  return short(JSON.stringify(value));
}

export function firewallMapRuleText(rule) {
  const conditions = [], actions = [];
  for (const expression of Array.isArray(rule.expr) ? rule.expr : []) {
    if (!expression || typeof expression !== 'object') continue;
    for (const [kind, value] of Object.entries(expression)) {
      if (kind === 'counter') continue;
      if (kind === 'match') {
        conditions.push(`${firewallMapValue(value?.left)} ${value?.op || '='} ${firewallMapValue(value?.right)}`);
      } else if (kind === 'accept') actions.push('Разрешить');
      else if (kind === 'drop') actions.push('Отбросить');
      else if (kind === 'reject') actions.push('Отклонить');
      else if (kind === 'return') actions.push('Вернуться');
      else if (kind === 'jump' || kind === 'goto') actions.push(`${kind} → ${value?.target || '—'}`);
      else if (kind === 'tproxy') actions.push(`TPROXY → ${value?.addr || 'локально'}${value?.port !== undefined ? `:${value.port}` : ''}`);
      else if (kind === 'redirect') actions.push(`REDIRECT${value?.port !== undefined ? ` → :${value.port}` : ''}`);
      else if (kind === 'mangle') actions.push(`${firewallMapValue(value?.key)} ← ${firewallMapValue(value?.value)}`);
      else if (kind === 'log') actions.push(`Записать в журнал${value?.prefix ? ` · ${value.prefix}` : ''}`);
      else if (kind === 'vmap') actions.push(`VMAP · ${firewallMapValue(value?.key)}`);
      else if (['dnat', 'snat', 'masquerade', 'queue', 'notrack', 'flow'].includes(kind)) actions.push(`${kind.toUpperCase()}${value === null ? '' : ` · ${firewallMapValue(value)}`}`);
      else conditions.push(`${kind}: ${firewallMapValue(value)}`);
    }
  }
  return { conditions, actions };
}

export function firewallMapCounter(value) {
  if (value === undefined || value === null || value === '') return '—';
  try { return BigInt(value).toLocaleString('ru-RU'); } catch { return String(value); }
}
