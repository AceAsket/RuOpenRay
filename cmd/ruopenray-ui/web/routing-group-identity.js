// ruleTag is an Xray field; group membership remains in the panel's names sidecar.
export function newRouteId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function routeGroupId(rule, names = {}) {
  return rule?.ruleTag ? names[`@group:${rule.ruleTag}`] || '' : '';
}

export function assignRouteGroup(rules, names, keyFor, title, id = newRouteId()) {
  for (const rule of rules) {
    // Preserve tags supplied in imported JSON (they can be used by Xray stats).
    if (!rule.ruleTag) rule.ruleTag = `ruopenray-rule:${newRouteId()}`;
    names[`@group:${rule.ruleTag}`] = id;
    names[keyFor(rule)] = title;
  }
  return id;
}

export function migrateNamedRouteGroups(rules, names, keyFor, isManaged) {
  let changed = false;
  for (let start = 0; start < rules.length;) {
    const rule = rules[start];
    const title = names[keyFor(rule)];
    if (rule.ruleTag || !title || isManaged(rule)) { start++; continue; }
    let end = start + 1;
    while (end < rules.length && !rules[end].ruleTag && !isManaged(rules[end]) && names[keyFor(rules[end])] === title) end++;
    if (end - start > 1) {
      assignRouteGroup(rules.slice(start, end), names, keyFor, title);
      changed = true;
    }
    start = end;
  }
  return changed;
}
