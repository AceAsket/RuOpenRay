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
  const iconify = normalizeIconifyIcon(preset.icon || preset.iconify || preset.iconUrl || '');
  if (iconify) {
    return `<span class="route-preset-icon route-preset-iconify ${className}" style="--route-icon-url: url('https://api.iconify.design/${escapeHtml(iconify)}.svg')" aria-hidden="true"><span class="route-preset-iconify-glyph"></span></span>`;
  }
  const [label, tone] = presetIconPair(key, preset);
  const icon = presetIconSvg(key, tone);
  return `<span class="route-preset-icon tone-${escapeHtml(tone)} ${className}" aria-hidden="true">${icon || `<span class="route-preset-text">${escapeHtml(label)}</span>`}</span>`;
}

export function normalizeIconifyIcon(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const direct = raw.match(/^([a-z0-9-]+):([a-z0-9-]+)$/i);
  if (direct) return `${direct[1].toLowerCase()}:${direct[2].toLowerCase()}`;
  try {
    const url = new URL(raw);
    if (url.hostname !== 'icon-sets.iconify.design') return '';
    const parts = url.pathname.split('/').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    const [prefix, name] = parts;
    if (!/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(name)) return '';
    return `${prefix.toLowerCase()}:${name.toLowerCase()}`;
  } catch {
    return '';
  }
  return '';
}

function presetIconSvg(key, tone) {
  const group = key.toLowerCase();
  if (group.includes('youtube')) return iconYoutube();
  if (group.includes('discord')) return iconDiscord();
  if (group.includes('telegram')) return iconTelegram();
  if (group.includes('instagram')) return iconCamera();
  if (group.includes('whatsapp')) return iconChat();
  if (group.includes('facebook') || group.includes('meta')) return iconMeta();
  if (group.includes('linkedin')) return iconLinkedIn();
  if (group.includes('microsoft')) return iconMicrosoft();
  if (group.includes('google') || group.includes('gemini')) return iconGoogle();
  if (group.includes('chatgpt') || group.includes('openai') || tone === 'ai') return iconAi();
  if (group.includes('nintendo')) return iconGamepad();
  if (group.includes('direct') || group.includes('family') || tone === 'direct') return iconLan();
  if (group.includes('antifilter') || group.includes('r minimal') || tone === 'runet') return iconRunet();
  if (tone === 'media') return iconMedia();
  return '';
}

function svg(body) {
  return `<svg viewBox="0 0 24 24" focusable="false">${body}</svg>`;
}

function brandSvg(viewBox, body) {
  return `<svg class="brand-icon" viewBox="${viewBox}" focusable="false">${body}</svg>`;
}

function iconYoutube() {
  return svg('<rect x="3" y="6.5" width="18" height="11" rx="3.2"></rect><path d="M10.5 9.2v5.6L15.6 12z" class="cut"></path>');
}

function iconDiscord() {
  return brandSvg('0 0 256 256', '<rect width="256" height="256" fill="#5865f2" rx="60"></rect><path fill="#fff" d="M197.308 64.797a165 165 0 0 0-40.709-12.627.62.62 0 0 0-.654.31c-1.758 3.126-3.706 7.206-5.069 10.412-15.373-2.302-30.666-2.302-45.723 0-1.364-3.278-3.382-7.286-5.148-10.412a.64.64 0 0 0-.655-.31 164.5 164.5 0 0 0-40.709 12.627.6.6 0 0 0-.268.23c-25.928 38.736-33.03 76.52-29.546 113.836a.7.7 0 0 0 .26.468c17.106 12.563 33.677 20.19 49.94 25.245a.65.65 0 0 0 .702-.23c3.847-5.254 7.276-10.793 10.217-16.618a.633.633 0 0 0-.347-.881 102.6 102.6 0 0 1-15.601-7.436.642.642 0 0 1-.063-1.064 86 86 0 0 0 3.098-2.428.62.62 0 0 1 .646-.088c32.732 14.944 68.167 14.944 100.512 0a.62.62 0 0 1 .655.08 80 80 0 0 0 3.106 2.436.642.642 0 0 1-.055 1.064 102.6 102.6 0 0 1-15.609 7.428.64.64 0 0 0-.339.889 133 133 0 0 0 10.208 16.61.64.64 0 0 0 .702.238c16.342-5.055 32.913-12.682 50.02-25.245a.65.65 0 0 0 .26-.46c4.17-43.141-6.985-80.616-29.571-113.836a.5.5 0 0 0-.26-.238M94.834 156.142c-9.855 0-17.975-9.047-17.975-20.158s7.963-20.158 17.975-20.158c10.09 0 18.131 9.127 17.973 20.158 0 11.111-7.962 20.158-17.973 20.158m66.456 0c-9.855 0-17.974-9.047-17.974-20.158s7.962-20.158 17.974-20.158c10.09 0 18.131 9.127 17.974 20.158 0 11.111-7.884 20.158-17.974 20.158"></path>');
}

function iconTelegram() {
  return svg('<path d="M3.4 11.4 20 4.8c.8-.3 1.4.2 1.1 1.2l-2.7 13.1c-.2.9-.9 1.1-1.6.5l-4.1-3-2 2c-.3.3-.8.2-.8-.3l.3-4.3 7.8-7.1-9.7 6.1-4.1-1.3c-.9-.3-.9-1 .2-1.4z"></path>');
}

function iconCamera() {
  return svg('<rect x="5" y="5" width="14" height="14" rx="4"></rect><circle class="cut" cx="12" cy="12" r="3.1"></circle><circle class="cut" cx="16.2" cy="7.8" r="1"></circle>');
}

function iconChat() {
  return svg('<path d="M12 4.2a7.4 7.4 0 0 0-6.2 11.5L5 20l4.3-1.1A7.4 7.4 0 1 0 12 4.2z"></path><path d="M8.6 9.1c.8 2.8 2.7 4.7 5.5 5.5l1.1-1.3-2-1.2-.9.8c-.9-.4-1.6-1.1-2-2l.8-.9-1.2-2z" class="cut"></path>');
}

function iconMeta() {
  return svg('<path d="M4.2 14.8c1.1-5.4 3.1-8.1 5.5-8.1 1.6 0 2.8 1.2 4.3 3.9 1.2-2.1 2.2-3.1 3.5-3.1 2.1 0 3.2 2.2 3.2 5.1 0 2.8-1.3 4.8-3.2 4.8-1.7 0-2.8-1.4-4.3-4.2-1.5 2.7-2.7 4.1-4.6 4.1-2 0-3.3-1.6-4.4-2.5zm1.8-.9c.8.9 1.7 1.5 2.6 1.5 1.1 0 2-.9 3.2-3.2-1-1.9-1.8-2.8-2.8-2.8-1.1 0-2.1 1.4-3 4.5zm9.4-1.1c.9 1.8 1.6 2.7 2.5 2.7.8 0 1.4-.9 1.4-2.6 0-1.6-.5-2.6-1.3-2.6-.7 0-1.3.7-2 1.9z"></path>');
}

function iconLinkedIn() {
  return svg('<rect x="4" y="4" width="16" height="16" rx="2.4"></rect><rect class="cut" x="7" y="10" width="2.4" height="7"></rect><circle class="cut" cx="8.2" cy="7.5" r="1.2"></circle><path class="cut" d="M11 10h2.2v1c.5-.7 1.2-1.2 2.3-1.2 1.7 0 2.7 1.1 2.7 3.2v4h-2.4v-3.5c0-.9-.4-1.4-1.2-1.4s-1.2.5-1.2 1.4V17H11z"></path>');
}

function iconMicrosoft() {
  return svg('<rect x="4" y="4" width="7" height="7"></rect><rect x="13" y="4" width="7" height="7"></rect><rect x="4" y="13" width="7" height="7"></rect><rect x="13" y="13" width="7" height="7"></rect>');
}

function iconGoogle() {
  return svg('<path d="M20 12.2c0-.6-.1-1.1-.2-1.6H12v3.1h4.5a3.8 3.8 0 0 1-1.7 2.5v2h2.7c1.6-1.5 2.5-3.6 2.5-6z"></path><path d="M12 20c2.3 0 4.2-.8 5.6-2.1l-2.7-2a5 5 0 0 1-7.5-2.6H4.6v2.1A8 8 0 0 0 12 20z"></path><path d="M7.4 13.3a5 5 0 0 1 0-3.1V8.1H4.6a8 8 0 0 0 0 7.2z"></path><path d="M12 7.2c1.2 0 2.4.4 3.3 1.3l2.4-2.4A8 8 0 0 0 4.6 8.1l2.8 2.1A4.9 4.9 0 0 1 12 7.2z"></path>');
}

function iconAi() {
  return svg('<path d="M12 3.8 18.6 7v7.9L12 20.2l-6.6-5.3V7z"></path><path class="cut" d="M12 6.8 15.8 9v4.1L12 16.2 8.2 13.1V9z"></path><circle cx="12" cy="12" r="1.3"></circle>');
}

function iconGamepad() {
  return svg('<path d="M7.2 9h9.6c2.2 0 3.4 1.7 3.8 4.8.3 2.4-.5 3.7-1.8 3.7-.9 0-1.6-.5-2.5-1.8H7.7c-.9 1.3-1.6 1.8-2.5 1.8-1.3 0-2.1-1.3-1.8-3.7C3.8 10.7 5 9 7.2 9z"></path><path class="cut" d="M7.1 12h1.4v-1.4h1.4V12h1.4v1.4H9.9v1.4H8.5v-1.4H7.1z"></path><circle class="cut" cx="15.8" cy="12.1" r="1"></circle><circle class="cut" cx="18" cy="14.2" r="1"></circle>');
}

function iconLan() {
  return svg('<rect x="5" y="5" width="14" height="9" rx="2"></rect><path d="M12 14v3"></path><path d="M8 19h8"></path>');
}

function iconRunet() {
  return svg('<circle cx="12" cy="12" r="8"></circle><path class="cut" d="M4.8 11h14.4v2H4.8z"></path><path class="cut" d="M11 4.8h2v14.4h-2z"></path>');
}

function iconMedia() {
  return svg('<rect x="5" y="5" width="14" height="14" rx="3"></rect><path class="cut" d="M10 8.5v7l5.8-3.5z"></path>');
}
