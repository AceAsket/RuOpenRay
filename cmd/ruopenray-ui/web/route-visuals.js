const presetIcons = {
  aiDev: ['AI', 'ai'],
  antifilterFull: ['AF', 'runet'],
  chatgpt: ['AI', 'ai'],
  directLan: ['LAN', 'direct'],
  discord: ['DS', 'discord'],
  discordFull: ['DS', 'discord'],
  discordRtc: ['RTC', 'discord'],
  discordVoice: ['VO', 'discord'],
  facebook: ['F', 'meta'],
  familyDirect: ['LAN', 'direct'],
  geminiAi: ['G', 'google'],
  googleFull: ['G', 'google'],
  googleNetwork: ['G', 'google'],
  googleWebRtcFallback: ['RTC', 'google'],
  instagram: ['IG', 'meta'],
  kinopubIps: ['KP', 'media'],
  linkedin: ['IN', 'linkedin'],
  mediaComms: ['M', 'media'],
  meta: ['M', 'meta'],
  metaFull: ['M', 'meta'],
  microsoftFull: ['MS', 'microsoft'],
  nintendoEshop: ['N', 'nintendo'],
  openaiIps: ['AI', 'ai'],
  ruMinimal: ['RU', 'runet'],
  telegram: ['TG', 'telegram'],
  telegramCalls: ['CALL', 'telegram'],
  telegramFull: ['TG', 'telegram'],
  telegramMtproto: ['MT', 'telegram'],
  whatsapp: ['WA', 'meta'],
  xrayuiBasic: ['XR', 'runet'],
  youtube: ['YT', 'youtube'],
};

const titleIconHints = [
  [/youtube|ютуб/i, ['YT', 'youtube']],
  [/discord|дискорд/i, ['DS', 'discord']],
  [/telegram|телеграм/i, ['TG', 'telegram']],
  [/instagram|инстаграм/i, ['IG', 'meta']],
  [/whatsapp|ватсап/i, ['WA', 'meta']],
  [/facebook|meta|фейсбук/i, ['M', 'meta']],
  [/linkedin/i, ['IN', 'linkedin']],
  [/microsoft|windows|xbox/i, ['MS', 'microsoft']],
  [/google|gemini/i, ['G', 'google']],
  [/chatgpt|openai|ai|dev/i, ['AI', 'ai']],
  [/nintendo|eshop/i, ['N', 'nintendo']],
  [/kino|media|кино|медиа/i, ['KP', 'media']],
  [/direct|lan|локаль|семейн/i, ['LAN', 'direct']],
  [/ru|рф|runet|antifilter/i, ['RU', 'runet']],
];

function presetIconPair(key, preset = {}) {
  if (presetIcons[key]) return presetIcons[key];
  const title = `${preset.title || ''} ${preset.detail || ''}`;
  const found = titleIconHints.find(([pattern]) => pattern.test(title));
  return found ? found[1] : ['R', 'default'];
}

export function routePresetIconView(escapeHtml, key, preset = {}, className = '') {
  const [label, tone] = presetIconPair(key, preset);
  return `<span class="route-preset-icon tone-${escapeHtml(tone)} ${className}" aria-hidden="true"><span>${escapeHtml(label)}</span></span>`;
}

function targetIconPair(tag = '', type = 'outbound') {
  const lower = String(tag).toLowerCase();
  if (type === 'balancer') return ['GR', 'balancer'];
  if (lower === 'direct' || lower === 'freedom') return ['DIR', 'direct'];
  if (lower === 'block' || lower === 'reject' || lower === 'blackhole') return ['BLK', 'block'];
  if (lower.includes('dns')) return ['DNS', 'dns'];
  if (lower.includes('proxy')) return ['PX', 'proxy'];
  return ['SRV', 'server'];
}

function targetKindLabel(tag = '', type = 'outbound') {
  const lower = String(tag).toLowerCase();
  if (type === 'balancer') return 'группа серверов';
  if (lower === 'direct' || lower === 'freedom') return 'напрямую';
  if (lower === 'block' || lower === 'reject' || lower === 'blackhole') return 'блокировка';
  if (lower.includes('dns')) return 'DNS outbound';
  return 'сервер';
}

export function routeTargetCard(escapeHtml, tag, type, active) {
  const [label, tone] = targetIconPair(tag, type);
  const attr = type === 'balancer' ? 'data-route-balancer-choice' : 'data-route-outbound-choice';
  return `
    <button class="route-target-card tone-${escapeHtml(tone)} ${active ? 'active' : ''}" type="button" ${attr}="${escapeHtml(tag)}">
      <span class="route-target-icon" aria-hidden="true">${escapeHtml(label)}</span>
      <span class="route-target-copy">
        <strong>${escapeHtml(tag)}</strong>
        <small>${escapeHtml(targetKindLabel(tag, type))}</small>
      </span>
    </button>
  `;
}
