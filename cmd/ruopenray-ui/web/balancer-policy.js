import { isServiceOutbound } from './outbound-tags.js';

// Xray uses prefixes for selectors and one Observatory feature for all groups.
export function balancerNeedsMonitor(balancer = {}) {
  return ['leastPing', 'leastLoad'].includes(balancer.strategy?.type) || Boolean(balancer.fallbackTag);
}

export function isFailoverBalancer(balancer = {}, config = {}) {
  const backup = (config.outbounds || []).find((outbound) => outbound.tag === balancer.fallbackTag);
  const selector = balancer.selector?.[0];
  const primary = selector ? (config.outbounds || []).filter((outbound) => outbound.tag?.startsWith(selector)) : [];
  return balancer.strategy?.type === 'leastPing' && balancer.selector?.length === 1 &&
    Boolean(balancer.fallbackTag) && balancer.fallbackTag !== balancer.selector[0] &&
    primary.length === 1 && primary[0].tag === balancer.selector[0] && !isServiceOutbound(primary[0]) && primary[0].protocol !== 'loopback' &&
    Boolean(backup) && !isServiceOutbound(backup) && backup.protocol !== 'loopback';
}

export function monitorTypeForConfig(config = {}) {
  return config.observatory ? 'observatory' : config.burstObservatory ? 'burstObservatory' : 'observatory';
}

export function balancerMonitorForm(config = {}) {
  const type = monitorTypeForConfig(config);
  const monitor = config[type] || {};
  return {
    routeBalancerMonitorType: type,
    routeBalancerProbeUrl: monitor.probeURL || monitor.probeUrl || monitor.pingConfig?.destination || 'https://www.gstatic.com/generate_204',
    routeBalancerProbeInterval: monitor.probeInterval || monitor.pingConfig?.interval || '10s',
    routeBalancerProbeTimeout: monitor.pingConfig?.timeout || '5s',
    routeBalancerProbeSampling: String(monitor.pingConfig?.sampling ?? 3),
  };
}

function duration(value, label, minimum = 0.1) {
  const text = String(value || '').trim();
  const parts = [...text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)];
  const seconds = parts.reduce((n, part) => n + Number(part[1]) * ({ ms: .001, s: 1, m: 60, h: 3600 }[part[2]]), 0);
  if (!parts.length || parts.map((part) => part[0]).join('') !== text || seconds < minimum || seconds > 86400) {
    throw new Error(`${label}: укажите время от ${minimum} с до 24 ч, например 10s или 1m`);
  }
  return text;
}

export function configureBalancerMonitor(config, selectors, form) {
  const next = structuredClone(config);
  const type = form.routeBalancerMonitorType || monitorTypeForConfig(next);
  if (!['observatory', 'burstObservatory'].includes(type)) throw new Error('Выберите тип автопроверки');
  const probeUrl = String(form.routeBalancerProbeUrl || '').trim();
  let url;
  try { url = new URL(probeUrl); } catch { throw new Error('Укажите полный HTTP(S) URL автопроверки'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('URL автопроверки должен быть HTTP(S), без пароля и фрагмента');
  }
  const interval = duration(form.routeBalancerProbeInterval, 'Интервал проверки', type === 'burstObservatory' ? 10 : 1);
  const subjectSelector = [...new Set([
    ...(next.observatory?.subjectSelector || []), ...(next.burstObservatory?.subjectSelector || []), ...selectors
  ])].filter(Boolean);
  if (type === 'observatory') {
    next.observatory = { ...next.observatory, subjectSelector, probeURL: probeUrl, probeInterval: interval, enableConcurrency: true };
    delete next.observatory.probeUrl;
    delete next.burstObservatory;
  } else {
    const sampling = Number(form.routeBalancerProbeSampling);
    if (!Number.isInteger(sampling) || sampling < 1 || sampling > 20) throw new Error('Число проб должно быть от 1 до 20');
    const timeout = duration(form.routeBalancerProbeTimeout, 'Таймаут проверки');
    const current = next.burstObservatory || {};
    next.burstObservatory = { ...current, subjectSelector, pingConfig: {
      ...current.pingConfig, destination: probeUrl, interval, sampling, timeout,
      httpMethod: current.pingConfig?.httpMethod || 'HEAD'
    } };
    delete next.observatory;
  }
  return next;
}

export function buildBalancerDraft(config, form, targets) {
  const next = structuredClone(config || {});
  next.routing ||= {};
  const balancers = next.routing.balancers ||= [];
  const editing = form.routeBalancerEditingIndex;
  const original = editing >= 0 ? balancers[editing] : null;
  if (editing >= 0 && (!original || (form.routeBalancerEditingTag && original.tag !== form.routeBalancerEditingTag))) {
    throw new Error('Список групп изменился. Откройте нужную группу заново перед сохранением.');
  }
  const tag = String(form.routeBalancerTag || '').trim();
  if (!tag) throw new Error('Укажите имя группы серверов');
  if (balancers.some((item, index) => item.tag === tag && index !== editing)) throw new Error(`Группа ${tag} уже есть`);
  if (original && original.tag !== tag && (form.disabledRouteRules || []).some((item) => item?.rule?.balancerTag === original.tag)) {
    throw new Error('Группа используется в отключенных правилах. Восстановите и переназначьте или удалите эти правила перед переименованием.');
  }
  const failover = form.routeBalancerMode === 'failover';
  const strategy = failover ? 'leastPing' : form.routeBalancerStrategy || 'random';
  if (!['random', 'roundRobin', 'leastPing', 'leastLoad'].includes(strategy)) throw new Error('Неизвестная стратегия балансировки');
  const selectors = failover ? [form.routeBalancerPrimary].filter(Boolean) :
    [...new Set(String(form.routeBalancerSelectors || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
  if (!selectors.length) throw new Error(failover ? 'Выберите основной VPN-сервер' : 'Выберите участников группы');
  const outbounds = (next.outbounds || []).filter((item) => typeof item?.tag === 'string' && item.tag);
  const eligible = (item) => !isServiceOutbound(item) && item.protocol !== 'loopback';
  for (const selector of selectors) {
    const matches = outbounds.filter((item) => item.tag.startsWith(selector));
    if (!matches.length) throw new Error(`Для префикса ${selector} сервер не найден. Выберите доступных участников группы.`);
    if (!failover && matches.some((item) => !eligible(item))) {
      throw new Error(`Префикс ${selector} включает служебный выход. Выберите отдельные VPN-серверы.`);
    }
    if (!failover && outbounds.some((item) => item.tag === selector) && matches.some((item) => !selectors.includes(item.tag))) {
      throw new Error(`Имя ${selector} является префиксом других серверов. Выберите всех совпавших участников или задайте серверу уникальное имя.`);
    }
  }
  const monitored = failover || ['leastPing', 'leastLoad'].includes(strategy) || form.routeBalancerHealthCheck !== false;
  let fallback = String(form.routeBalancerFallback || '').trim();
  if (failover) {
    if (!fallback || fallback === selectors[0]) throw new Error('Выберите отдельный резервный VPN-сервер');
    if (![selectors[0], fallback].every((value) => targets.some((target) => target.tag === value)
      && outbounds.some((item) => item.tag === value && eligible(item)))) {
      throw new Error('Основной или резервный сервер больше недоступен в профиле');
    }
    const matches = (next.outbounds || []).filter((item) => item.tag?.startsWith(selectors[0]));
    if (matches.length !== 1 || matches[0].tag !== selectors[0]) {
      throw new Error('Имя основного сервера совпадает с префиксом других серверов. Задайте ему уникальное имя перед резервированием');
    }
  }
  if (fallback && !(next.outbounds || []).some((item) => item.tag === fallback)) throw new Error('Резервный выход не найден в конфигурации');
  if (monitored && !fallback) {
    next.outbounds ||= [];
    fallback = next.outbounds.find((item) => item.protocol === 'blackhole')?.tag;
    if (!fallback) {
      fallback = 'ruopenray-balancer-block';
      while (next.outbounds.some((item) => item.tag === fallback)) fallback += '-1';
      next.outbounds.push({ tag: fallback, protocol: 'blackhole', settings: {} });
    }
  }
  if (!failover && (next.outbounds || []).some((item) => !eligible(item) && selectors.some((selector) => item.tag?.startsWith(selector)))) {
    throw new Error('Выбранный префикс включает служебный резервный выход. Выберите отдельные VPN-серверы.');
  }
  if (!monitored && fallback) throw new Error('Для резервного выхода включите проверку доступности');
  const balancer = { ...original, tag, selector: selectors,
    strategy: original?.strategy?.type === strategy ? structuredClone(original.strategy) : { type: strategy } };
  if (strategy === 'leastLoad') {
    const expected = Number(form.routeBalancerExpected ?? original?.strategy?.settings?.expected ?? 1);
    if (!Number.isInteger(expected) || expected < 0 || expected > 100) throw new Error('Число лучших серверов должно быть от 0 до 100');
    balancer.strategy.settings = { ...balancer.strategy.settings, expected };
  }
  delete balancer.fallbackTag;
  if (fallback) balancer.fallbackTag = fallback;
  if (original && original.tag !== tag) {
    for (const rule of next.routing.rules || []) if (rule.balancerTag === original.tag) rule.balancerTag = tag;
  }
  if (original) balancers[editing] = balancer;
  else balancers.unshift(balancer);
  const fallbackOutbound = (next.outbounds || []).find((outbound) => outbound.tag === fallback);
  const observed = [...selectors, ...(fallbackOutbound?.protocol === 'blackhole' ? [] : [fallback])];
  return monitored ? configureBalancerMonitor(next, observed, form) : next;
}
