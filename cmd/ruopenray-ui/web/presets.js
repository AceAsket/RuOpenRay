// Navigation labels and routing presets are kept separate from the renderer so app.js stays navigable.

export const nav = [
  ['dashboard', 'Панель'],
  ['setup', 'Мастер'],
  ['servers', 'Серверы'],
  ['routing', 'Маршрутизация'],
  ['dns', 'DNS'],
  ['diagnostics', 'Диагностика'],
  ['profiles', 'Профили'],
  ['settings', 'Настройки']
];

export const tabTitles = {
  ...Object.fromEntries(nav),
  sni: 'SNI',
  geo: 'Geo-файлы',
  devices: 'Устройства',
  firewall: 'Файрвол',
  logs: 'Логи'
};

export const labels = {
  running: 'Работает',
  stopped: 'Остановлен',
  available: 'Доступно',
  missing: 'Не найден',
  active: 'активен',
  stored: 'сохранен'
};

export const routeKinds = {
  domain: 'Сайт или домен',
  ip: 'IP или подсеть',
  source: 'Устройство LAN',
  port: 'Порт',
  inboundTag: 'Входящий поток',
  default: 'Остальной трафик'
};

export const managedRouteTags = {
  'ruopenray-api': 'Xray API / статистика',
  ruopenray_dns_in: 'DNS через RuOpenRay',
  transparent_ipv4: 'Перехват LAN-трафика',
  'dns-out': 'DNS-выход Xray'
};

export const routePlaceholders = {
  domain: 'domain:youtube.com, geosite:youtube',
  ip: '8.8.8.8, 1.1.1.0/24, geoip:telegram',
  source: '192.168.50.157',
  port: '443 или 50000-65535',
  inboundTag: 'transparent_ipv4',
  default: ''
};

const discordDomains = [
  'domain:discord.com',
  'domain:discord.gg',
  'domain:discord.media',
  'domain:discordapp.com',
  'domain:discordapp.net',
  'domain:gateway.discord.gg',
  'domain:media.discordapp.net',
  'domain:cdn.discordapp.com',
  'domain:vencord.dev',
  'domain:status.discord.com',
  'domain:updates.discord.com',
  'domain:router.discordapp.net',
  'domain:rtc.discord.media',
  'domain:voice.discord.media',
  'domain:images-ext-1.discordapp.net',
  'domain:images-ext-2.discordapp.net',
  'domain:discord-attachments-uploads-prd.storage.googleapis.com'
];

const discordCloudflareRtcIps = [
  '104.16.0.0/12',
  '104.24.0.0/14',
  '162.158.0.0/15',
  '162.159.0.0/16',
  '172.64.0.0/13',
  '188.114.96.0/20',
  '198.41.128.0/17',
  '190.93.240.0/20',
  '197.234.240.0/22',
  '198.41.192.0/19'
];

const discordVoiceIps = [
  '66.22.192.0/18',
  '66.22.196.0/24',
  '66.22.197.0/24',
  '66.22.198.0/24',
  '66.22.199.0/24',
  '66.22.216.0/24',
  '66.22.217.0/24',
  '66.22.237.0/24',
  '66.22.238.0/24',
  '66.22.241.0/24',
  '66.22.242.0/24',
  '66.22.243.0/24',
  '66.22.244.0/24',
  '198.244.231.0/24',
  '195.62.89.0/24',
  '64.71.8.96/29',
  '12.129.184.160/29',
  '138.128.136.0/21',
  '5.200.14.128/25'
];

const googleWebRtcFallbackIps = [
  '34.0.0.0/15',
  '34.2.0.0/15',
  '34.126.226.0/24',
  '35.192.0.0/12',
  '35.208.0.0/12',
  '35.207.81.0/24',
  '35.207.171.0/24',
  '35.207.188.0/24',
  '64.233.165.0/24'
];

const telegramDomains = [
  'domain:telegram.org',
  'domain:t.me',
  'domain:telegra.ph',
  'domain:telegram.me',
  'domain:telegram.dog',
  'domain:tdesktop.com',
  'domain:tx.me',
  'domain:contest.com',
  'domain:graph.org',
  'domain:cdn-telegram.org',
  'regexp:.*\\.telegram\\.org',
  'regexp:.*\\.t\\.me',
  'regexp:.*\\.telegra\\.ph'
];

const telegramMtprotoIps = [
  '5.28.128.0/17',
  '91.105.192.0/23',
  '91.108.4.0/22',
  '91.108.8.0/22',
  '91.108.12.0/22',
  '91.108.16.0/22',
  '91.108.20.0/22',
  '91.108.56.0/22',
  '95.161.64.0/20',
  '149.154.160.0/20',
  '149.154.164.0/22',
  '149.154.167.0/24',
  '185.76.151.0/24',
  '109.239.140.0/24',
  '149.154.175.0/24'
];

const telegramCallIps = [
  '91.108.0.0/16',
  '149.154.160.0/20',
  '149.154.0.0/16'
];

const instagramDomains = [
  'geosite:instagram',
  'domain:instagram.com',
  'domain:www.instagram.com',
  'domain:i.instagram.com',
  'domain:graph.instagram.com',
  'domain:cdninstagram.com',
  'domain:threads.net',
  'regexp:.*\\.instagram\\.com',
  'regexp:.*\\.cdninstagram\\.com'
];

const whatsappDomains = [
  'geosite:whatsapp',
  'domain:whatsapp.com',
  'domain:web.whatsapp.com',
  'domain:whatsapp.net',
  'domain:wa.me',
  'domain:mmg.whatsapp.net',
  'domain:static.whatsapp.net',
  'regexp:.*\\.whatsapp\\.com',
  'regexp:.*\\.whatsapp\\.net'
];

const facebookDomains = [
  'geosite:facebook',
  'geosite:facebook-dev',
  'domain:facebook.com',
  'domain:fb.com',
  'domain:fb.me',
  'domain:fbcdn.net',
  'domain:fbsbx.com',
  'domain:messenger.com',
  'domain:m.me',
  'domain:connect.facebook.net',
  'domain:graph.facebook.com',
  'regexp:.*\\.facebook\\.com',
  'regexp:.*\\.fbcdn\\.net',
  'regexp:.*\\.messenger\\.com'
];

const metaDomains = [
  'geosite:meta',
  'domain:meta.com',
  'domain:metacareers.com',
  ...facebookDomains,
  ...instagramDomains,
  ...whatsappDomains
];

const tuyaDomains = [
  'domain:tuya.com',
  'domain:tuyaeu.com',
  'domain:tuyacn.com',
  'domain:tuyaus.com',
  'domain:tuyaaf.com',
  'domain:iotbing.com',
  'domain:tuya-inc.cn',
  'domain:smartapp.tuya.com',
  'domain:smartlife.app.tuya.com',
  'domain:app.tuya.com',
  'domain:openapi.tuyaus.com',
  'domain:openapi.tuyacn.com',
  'domain:openapi.tuyaeu.com',
  'domain:openapi.tuyain.com',
  'domain:openapi-sg.iotbing.com',
  'domain:openapi-ueaz.tuyaus.com',
  'domain:openapi-weaz.tuyaeu.com',
  'full:nlb-vuyt41vm4ajpnwwimz.cn-shanghai.nlb.aliyuncs.com'
];

const linkedinDomains = [
  'geosite:linkedin',
  'domain:linkedin.com',
  'domain:www.linkedin.com',
  'domain:lnkd.in',
  'domain:licdn.com',
  'domain:linkedinstatic.com',
  'regexp:.*\\.linkedin\\.com',
  'regexp:.*\\.licdn\\.com',
  'regexp:.*\\.linkedinstatic\\.com'
];

const githubDomains = [
  'geosite:github',
  'domain:github.com',
  'domain:api.github.com',
  'domain:github.io',
  'domain:githubassets.com',
  'domain:githubusercontent.com',
  'domain:raw.githubusercontent.com',
  'domain:objects.githubusercontent.com',
  'regexp:.*\\.github\\.com',
  'regexp:.*\\.githubusercontent\\.com'
];

const claudeDomains = [
  'domain:claude.ai',
  'domain:anthropic.com',
  'domain:anthropic.ai',
  'domain:console.anthropic.com',
  'domain:api.anthropic.com',
  'domain:docs.anthropic.com',
  'regexp:.*\\.claude\\.ai',
  'regexp:.*\\.anthropic\\.com',
  'regexp:.*\\.anthropic\\.ai'
];

const xTwitterDomains = [
  'geosite:x',
  'domain:x.com',
  'domain:twitter.com',
  'domain:t.co',
  'domain:twimg.com',
  'domain:pbs.twimg.com',
  'domain:video.twimg.com',
  'regexp:.*\\.twitter\\.com',
  'regexp:.*\\.x\\.com',
  'regexp:.*\\.twimg\\.com'
];

const tiktokDomains = [
  'geosite:tiktok',
  'domain:tiktok.com',
  'domain:tiktokcdn.com',
  'domain:tiktokv.com',
  'domain:byteoversea.com',
  'domain:ibytedtos.com',
  'regexp:.*\\.tiktok\\.com',
  'regexp:.*\\.tiktokcdn\\.com',
  'regexp:.*\\.tiktokv\\.com'
];

const netflixDomains = [
  'geosite:netflix',
  'domain:netflix.com',
  'domain:nflxext.com',
  'domain:nflximg.com',
  'domain:nflxso.net',
  'domain:nflxvideo.net',
  'regexp:.*\\.netflix\\.com',
  'regexp:.*\\.nflxvideo\\.net'
];

const cloudflareDomains = [
  'geosite:cloudflare',
  'domain:cloudflare.com',
  'domain:cloudflare-dns.com',
  'domain:cdnjs.cloudflare.com',
  'domain:workers.dev',
  'regexp:.*\\.cloudflare\\.com',
  'regexp:.*\\.workers\\.dev'
];

const xrayuiBasicDomains = [
  'geosite:google',
  'geosite:meta',
  'geosite:telegram',
  'geosite:x',
  'geosite:discord',
  'geosite:rutracker',
  'geosite:tiktok',
  'geosite:netflix',
  'geosite:github',
  'geosite:cloudflare',
  'geosite:category-media-ru',
  'geosite:kinopub',
  'geosite:akamai',
  'domain:themoviedb.org',
  'domain:ntc.party'
];

const nintendoEshopDomains = [
  'domain:bugyo.hac.lp1.eshop.nintendo.net',
  'domain:nemof.hac.lp1.nemo.srv.nintendo.net',
  'domain:dragons.hac.lp1.dragons.nintendo.net',
  'domain:dragonst.hac.lp1.dragons.nintendo.net',
  'domain:tigers.hac.lp1.dragons.nintendo.net',
  'domain:atumn.hac.lp1.d4c.nintendo.net',
  'domain:aqua.hac.lp1.d4c.nintendo.net',
  'domain:tagaya.hac.lp1.eshop.nintendo.net',
  'domain:beach.hac.lp1.eshop.nintendo.net',
  'domain:pearljam.hac.lp1.eshop.nintendo.net',
  'domain:pushmo.hac.lp1.eshop.nintendo.net',
  'domain:superfly.hac.lp1.d4c.nintendo.net',
  'domain:veer.hac.lp1.d4c.nintendo.net',
  'domain:atum.hac.lp1.d4c.nintendo.net',
  'domain:idbe-hac.cdn.nintendo.net',
  'domain:gw.hac.lp1.vermillion.srv.nintendo.net',
  'domain:pegasus.hac.lp1.pegasus.srv.nintendo.net'
];

const openaiDomains = [
  'domain:chatgpt.com',
  'domain:openai.com'
];

const openaiIps = [
  '162.159.140.0/24',
  '172.64.150.0/24',
  '172.64.146.15',
  '172.64.148.171',
  '172.64.152.228',
  '172.64.155.209',
  '172.64.155.214',
  '104.18.32.0/24',
  '104.18.35.28',
  '104.18.37.0/24',
  '104.18.39.85',
  '104.18.41.241',
  '188.114.98.0/24',
  '188.114.99.0/24',
  '8.6.112.0/24',
  '8.47.69.0/24'
];

const kinopubIps = [
  '5.188.189.0/24',
  '5.199.173.0/24',
  '5.252.22.0/24',
  '18.195.13.0/24',
  '38.180.44.0/24',
  '45.55.82.0/24',
  '46.166.167.0/24',
  '54.37.134.0/24',
  '57.128.212.0/24',
  '91.215.42.0/24',
  '94.237.41.0/24',
  '94.237.42.0/23',
  '94.237.111.0/24',
  '94.237.125.0/24',
  '95.129.233.0/24',
  '104.21.45.0/24',
  '128.199.54.0/24',
  '139.59.96.0/24',
  '172.67.218.0/24',
  '185.42.163.0/24',
  '194.38.21.0/24',
  '194.40.243.0/24',
  '194.67.111.0/24'
];

const kinopubDomains = [
  'domain:kino.pub',
  'regexp:kinopub.*',
  'domain:gfw.ovh',
  'domain:gfw.ov',
  'domain:vjs.zencdn.net',
  'domain:m.pushbr.com',
  'domain:mos-gorsud.com',
  'domain:mos-gorsud.net',
  'domain:mos-gorsud.co',
  'domain:zamerka.com',
  'domain:cdn32.lol',
  'domain:kpdl.link',
  'regexp:cdn-service.*',
  'domain:cdntogo.net',
  'domain:cdn2cdn.com',
  'domain:cdn2site.com'
];

const geminiAiDomains = [
  'domain:gemini.google.com',
  'domain:gemini.google',
  'domain:ai.google',
  'domain:aistudio.google.com',
  'domain:makersuite.google.com',
  'domain:alkalimakersuite-pa.clients6.google.com',
  'domain:generativelanguage.googleapis.com',
  'domain:content-generativelanguage.googleapis.com',
  'domain:cloudcode-pa.googleapis.com',
  'domain:firebasevertexai.googleapis.com',
  'domain:aiplatform.googleapis.com',
  'domain:oauth2.googleapis.com',
  'domain:accounts.google.com',
  'domain:ogs.google.com',
  'domain:www.gstatic.com',
  'domain:ssl.gstatic.com',
  'domain:fonts.gstatic.com',
  'domain:lh3.googleusercontent.com',
  'domain:play.google.com',
  'domain:workspace.google.com',
  'geosite:google-gemini'
];

const googleCoreDomains = [
  'domain:googleapis.com',
  'domain:googletagmanager.com',
  'domain:googlevideo.com',
  'domain:ggpht.com',
  'domain:gstatic.com',
  'domain:googleusercontent.com',
  'domain:gemini.google.com',
  'geosite:google-gemini'
];

const googleNetworkIps = [
  '64.233.160.0/19',
  '66.102.0.0/20',
  '70.32.128.0/19',
  '72.14.192.0/18',
  '74.125.0.0/16',
  '108.177.0.0/17',
  '142.250.0.0/15',
  '142.251.0.0/16',
  '172.217.0.0/16',
  '172.253.0.0/16',
  '173.194.0.0/16',
  '209.85.128.0/17',
  '216.58.192.0/19',
  '216.239.32.0/19'
];

const youtubeDomains = [
  'geosite:youtube',
  'domain:youtube.com',
  'domain:youtu.be',
  'domain:youtube-nocookie.com',
  'domain:youtubei.googleapis.com',
  'domain:ytimg.com',
  'regexp:.*\\.googlevideo\\.com',
  'regexp:.*\\.youtube\\.com',
  'regexp:.*\\.ytimg\\.com'
];

const antifilterRules = [
  { type: 'field', outboundTag: 'proxy', ip: ['geoip:antifilter', 'geoip:antifilter-community'] },
  { type: 'field', outboundTag: 'proxy', domain: ['ext:"LoyalsoldierSite.dat:antifilter-community"'] }
];

const microsoftDomains = [
  'regexp:.*\\.microsoft\\.com',
  'regexp:.*\\.windows\\.com',
  'regexp:.*\\.live\\.com',
  'regexp:.*\\.office\\.com',
  'regexp:.*\\.office365\\.com',
  'regexp:.*\\.microsoftstore\\.com',
  'regexp:.*\\.xboxlive\\.com',
  'regexp:.*\\.xboxservices\\.com',
  'regexp:.*\\.azureedge\\.net',
  'regexp:.*\\.msedge\\.net',
  'regexp:.*\\.visualstudio\\.com',
  'regexp:.*\\.trafficmanager\\.net',
  'regexp:.*\\.mp\\.microsoft\\.com',
  'regexp:.*\\.delivery\\.mp\\.microsoft\\.com',
  'regexp:.*\\.windowsupdate\\.com',
  'regexp:.*\\.update\\.microsoft\\.com',
  'regexp:.*\\.download\\.windowsupdate\\.com',
  'regexp:.*\\.do\\.dl\\.delivery\\.mp\\.microsoft\\.com',
  'regexp:.*\\.dl\\.delivery\\.mp\\.microsoft\\.com',
  'regexp:.*\\.storeedgefd\\.dsx\\.mp\\.microsoft\\.com',
  'regexp:.*\\.login\\.live\\.com',
  'regexp:.*\\.login\\.microsoftonline\\.com',
  'regexp:.*\\.officecdn\\.microsoft\\.com',
  'regexp:.*\\.sharepoint\\.com',
  'regexp:.*\\.onedrive\\.live\\.com',
  'regexp:.*\\.1drv\\.com'
];

const microsoftIps = [
  '13.64.0.0/11',
  '20.0.0.0/8',
  '40.64.0.0/10',
  '51.0.0.0/8',
  '52.0.0.0/8',
  '104.40.0.0/13',
  '150.171.0.0/16',
  '204.79.197.0/24'
];

export const routePresets = {
  youtube: {
    title: 'YouTube через proxy',
    detail: 'geosite, основные домены, short links, API, ytimg и regexp для googlevideo/youtube.',
    rule: { type: 'field', outboundTag: 'proxy', domain: youtubeDomains }
  },
  discord: {
    title: 'Discord через proxy',
    detail: '17 доменов Discord: CDN, gateway, voice, status, media и Vencord.',
    rule: { type: 'field', outboundTag: 'proxy', domain: discordDomains }
  },
  discordRtc: {
    title: 'Discord RTC / Cloudflare',
    detail: 'UDP диапазоны Cloudflare для Discord RTC и WebRTC fallback.',
    rule: { type: 'field', outboundTag: 'proxy', network: 'udp', ip: discordCloudflareRtcIps }
  },
  discordVoice: {
    title: 'Discord voice / media',
    detail: 'UDP диапазоны Discord voice/media и дополнительные media-сети.',
    rule: { type: 'field', outboundTag: 'proxy', network: 'udp', ip: discordVoiceIps }
  },
  telegram: {
    title: 'Telegram домены через proxy',
    detail: 'Домены Telegram, t.me, telegra.ph и regexp для поддоменов.',
    rule: { type: 'field', outboundTag: 'proxy', domain: telegramDomains }
  },
  telegramMtproto: {
    title: 'Telegram MTProto через proxy',
    detail: 'IP/subnet диапазоны Telegram MTProto, включая новые media-инфраструктуры.',
    rule: { type: 'field', outboundTag: 'proxy', ip: telegramMtprotoIps }
  },
  telegramCalls: {
    title: 'Telegram звонки через proxy',
    detail: 'UDP диапазоны Telegram для звонков и peer/media трафика.',
    rule: { type: 'field', outboundTag: 'proxy', network: 'udp', ip: telegramCallIps }
  },
  instagram: {
    title: 'Instagram через proxy',
    detail: 'Instagram, CDN, Graph API и Threads через активный сервер.',
    rule: { type: 'field', outboundTag: 'proxy', domain: instagramDomains }
  },
  whatsapp: {
    title: 'WhatsApp через proxy',
    detail: 'Web WhatsApp, wa.me, whatsapp.net и медиа-домены.',
    rule: { type: 'field', outboundTag: 'proxy', domain: whatsappDomains }
  },
  facebook: {
    title: 'Facebook через proxy',
    detail: 'Facebook, Messenger, Graph API, CDN и facebook-dev geosite.',
    rule: { type: 'field', outboundTag: 'proxy', domain: facebookDomains }
  },
  linkedin: {
    title: 'LinkedIn через proxy',
    detail: 'LinkedIn, short links, CDN и статические ресурсы.',
    rule: { type: 'field', outboundTag: 'proxy', domain: linkedinDomains }
  },
  github: {
    title: 'GitHub через proxy',
    detail: 'GitHub, API, raw/assets, Pages и githubusercontent.',
    rule: { type: 'field', outboundTag: 'proxy', domain: githubDomains }
  },
  claude: {
    title: 'Claude через proxy',
    detail: 'Claude web, Anthropic Console, API и документация через активный сервер.',
    rule: { type: 'field', outboundTag: 'proxy', domain: claudeDomains }
  },
  xTwitter: {
    title: 'X / Twitter через proxy',
    detail: 'X, Twitter, t.co, media CDN и twimg.',
    rule: { type: 'field', outboundTag: 'proxy', domain: xTwitterDomains }
  },
  tiktok: {
    title: 'TikTok через proxy',
    detail: 'TikTok, CDN, byteoversea и video/static домены.',
    rule: { type: 'field', outboundTag: 'proxy', domain: tiktokDomains }
  },
  netflix: {
    title: 'Netflix через proxy',
    detail: 'Netflix, nflxvideo и служебные CDN-домены.',
    rule: { type: 'field', outboundTag: 'proxy', domain: netflixDomains }
  },
  cloudflareCdn: {
    title: 'Cloudflare / CDN через proxy',
    detail: 'Cloudflare, workers.dev, cloudflare-dns и CDNJS.',
    rule: { type: 'field', outboundTag: 'proxy', domain: cloudflareDomains }
  },
  meta: {
    title: 'Meta через proxy',
    detail: 'Meta, Facebook, Instagram, WhatsApp, Messenger и общие CDN.',
    rule: { type: 'field', outboundTag: 'proxy', domain: metaDomains }
  },
  tuya: {
    title: 'Tuya / Smart Life через proxy',
    detail: 'Tuya, Smart Life, OpenAPI и региональные облака Tuya.',
    rule: { type: 'field', outboundTag: 'proxy', domain: tuyaDomains }
  },
  chatgpt: {
    title: 'OpenAI / ChatGPT через proxy',
    detail: 'ChatGPT/OpenAI домены и Cloudflare/OpenAI IP ranges одной подборкой.',
    rule: { type: 'field', outboundTag: 'proxy', domain: openaiDomains, ip: openaiIps }
  },
  openaiIps: {
    title: 'OpenAI IP через proxy',
    detail: 'Cloudflare/OpenAI IP ranges и точечные адреса для ChatGPT/OpenAI.',
    rule: { type: 'field', outboundTag: 'proxy', ip: openaiIps }
  },
  kinopubIps: {
    title: 'KinoPub через proxy',
    detail: 'Домены KinoPub, CDN/зеркала и 23 IP/subnet правила для backend-адресов.',
    rule: { type: 'field', outboundTag: 'proxy', domain: kinopubDomains, ip: kinopubIps }
  },
  geminiAi: {
    title: 'Google Gemini / AI через proxy',
    detail: 'Gemini, AI Studio, Generative Language API, OAuth и нужные gstatic/googleusercontent.',
    rule: { type: 'field', outboundTag: 'proxy', domain: geminiAiDomains }
  },
  googleWebRtcFallback: {
    title: 'Google WebRTC fallback',
    detail: 'UDP диапазоны Google, которые часто используются как WebRTC fallback.',
    rule: { type: 'field', outboundTag: 'proxy', network: 'udp', ip: googleWebRtcFallbackIps }
  },
  googleNetwork: {
    title: 'Google TCP/CDN ranges',
    detail: 'Основные Google TCP/CDN IP ranges для Googlevideo, QUIC и CDN-сценариев.',
    rule: { type: 'field', outboundTag: 'proxy', ip: googleNetworkIps }
  },
  nintendoEshop: {
    title: 'Nintendo eShop через proxy',
    detail: '17 hostnames для eShop, Nemo, Dragons, D4C, CDN и Vermillion.',
    rule: { type: 'field', outboundTag: 'proxy', domain: nintendoEshopDomains }
  },
  directLan: {
    title: 'Локальная сеть напрямую',
    rule: { type: 'field', outboundTag: 'direct', ip: ['geoip:private', '127.0.0.1/8', '::1/128'] }
  }
};

export const routeBundles = {
  ruMinimal: {
    title: 'Минимальный РФ',
    detail: 'Локальная сеть и RU напрямую, antifilter-community через proxy.',
    rules: [
      { type: 'field', outboundTag: 'direct', ip: ['geoip:private'] },
      { type: 'field', outboundTag: 'direct', domain: ['geosite:ru'] },
      { type: 'field', outboundTag: 'proxy', domain: ['ext:"LoyalsoldierSite.dat:antifilter-community"'] }
    ]
  },
  discordFull: {
    title: 'Discord полный',
    detail: 'Домены, CDN, RTC через Cloudflare, voice/media и резервные Google WebRTC диапазоны.',
    rules: [
      { type: 'field', outboundTag: 'proxy', domain: discordDomains },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: discordCloudflareRtcIps },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: discordVoiceIps },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: googleWebRtcFallbackIps }
    ]
  },
  telegramFull: {
    title: 'Telegram полный',
    detail: 'Домены Telegram, regexp-паттерны, MTProto IP и UDP для звонков.',
    rules: [
      { type: 'field', outboundTag: 'proxy', domain: telegramDomains },
      { type: 'field', outboundTag: 'proxy', ip: telegramMtprotoIps },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: telegramCallIps }
    ]
  },
  metaFull: {
    title: 'Meta полный',
    detail: 'Meta, Facebook, Instagram, WhatsApp, Messenger и CDN одной подборкой.',
    rules: [
      { type: 'field', outboundTag: 'proxy', domain: metaDomains }
    ]
  },
  tuyaSmartLife: {
    title: 'Tuya / Smart Life',
    detail: 'Tuya, Smart Life, региональные OpenAPI endpoints и облачный NLB из практического списка.',
    rules: [
      routePresets.tuya.rule
    ]
  },
  xrayuiBasic: {
    title: 'Базовый набор xrayui',
    detail: 'Google, Meta, Telegram, X, Discord, RuTracker, TikTok, Netflix, GitHub, Cloudflare, media-ru, KinoPub и Akamai.',
    rules: [
      { type: 'field', outboundTag: 'proxy', domain: xrayuiBasicDomains },
      { type: 'field', outboundTag: 'proxy', ip: ['geoip:telegram', 'geoip:cloudflare', '130.255.77.28'] },
      { type: 'field', outboundTag: 'proxy', network: 'udp', port: '50000-51000,1400,3478-3481,5349,19294-19344' }
    ]
  },
  googleFull: {
    title: 'Google / CDN / QUIC',
    detail: 'Google domains, Gemini geosite, QUIC/HTTP3 UDP ranges и TCP/CDN ranges.',
    rules: [
      { type: 'field', outboundTag: 'proxy', domain: googleCoreDomains },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: googleNetworkIps },
      { type: 'field', outboundTag: 'proxy', ip: googleNetworkIps }
    ]
  },
  microsoftFull: {
    title: 'Microsoft / Windows / Store',
    detail: 'Microsoft, Windows Update, Store, Xbox, Office, Azure CDN и UDP/QUIC диапазоны.',
    rules: [
      { type: 'field', outboundTag: 'proxy', domain: microsoftDomains },
      { type: 'field', outboundTag: 'proxy', ip: microsoftIps },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: microsoftIps }
    ]
  },
  antifilterFull: {
    title: 'Antifilter geo/ext',
    detail: 'geoip:antifilter, geoip:antifilter-community и ext LoyalsoldierSite.dat.',
    rules: antifilterRules
  },
  mediaComms: {
    title: 'YouTube / Discord / Telegram',
    detail: 'Популярные медиа и мессенджеры через активный proxy.',
    rules: [
      routePresets.youtube.rule,
      routePresets.discord.rule,
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: discordCloudflareRtcIps },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: discordVoiceIps },
      { type: 'field', outboundTag: 'proxy', domain: telegramDomains },
      { type: 'field', outboundTag: 'proxy', ip: telegramMtprotoIps },
      { type: 'field', outboundTag: 'proxy', network: 'udp', ip: telegramCallIps }
    ]
  },
  aiDev: {
    title: 'AI / Dev',
    detail: 'AI-сервисы, GitHub, Claude, OpenAI и Google Gemini через proxy.',
    rules: [
      routePresets.chatgpt.rule,
      routePresets.claude.rule,
      routePresets.geminiAi.rule,
      routePresets.github.rule
    ]
  },
  familyDirect: {
    title: 'Семейный direct',
    detail: 'Домашняя сеть, роутер и локальные адреса напрямую.',
    rules: [
      routePresets.directLan.rule,
      { type: 'field', outboundTag: 'direct', source: ['192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12'] }
    ]
  }
};

export const hiddenBuiltinRoutePresetKeys = new Set([
  'discord',
  'discordRtc',
  'discordVoice',
  'telegram',
  'telegramMtproto',
  'telegramCalls',
  'googleWebRtcFallback',
  'googleNetwork',
  'meta',
  'tuya',
  'openaiIps',
  'xrayuiBasic',
  'directLan',
  'mediaComms',
  'aiDev',
  'familyDirect'
]);

