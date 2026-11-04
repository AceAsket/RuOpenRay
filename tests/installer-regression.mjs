import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Execute the actual POSIX installer against a rewritten, isolated filesystem.
// Every network/package/service command is fake; no router is contacted.
const source = readFileSync(new URL('../scripts/install-openwrt.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const shell = process.env.RUOPENRAY_TEST_SHELL || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/sh.exe' : '/bin/sh');
const posix = (value) => process.platform === 'win32' ? value.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) : value;
const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const mockSource = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.INSTALLER_TEST_ROOT;
const mode = process.argv[2];
const args = process.argv.slice(3);
const native = value => process.platform === 'win32' ? value.replace(/^\/([a-z])\//i, (_, drive) => drive.toUpperCase()+':/') : value;
const file = relative => path.join(root, relative);
const base = () => fs.existsSync(file('etc/config/ruopenray-ui')) ? JSON.parse(fs.readFileSync(file('etc/config/ruopenray-ui'),'utf8').trim() || '{}') : {};
const load = () => ({...base(), ...(fs.existsSync(file('uci-delta.json')) ? JSON.parse(fs.readFileSync(file('uci-delta.json'),'utf8')) : {})});
const save = value => fs.writeFileSync(file('uci-delta.json'),JSON.stringify(value));
fs.appendFileSync(file('calls.jsonl'), JSON.stringify({mode,args})+'\n');
function activate() {
  if (process.env.INSTALLER_TEST_FAILURE === 'start' && fs.readFileSync(file('usr/bin/ruopenray-ui')).equals(fs.readFileSync(file('candidate')))) process.exit(1);
  fs.mkdirSync(file('proc/777'),{recursive:true});
  fs.copyFileSync(file('usr/bin/ruopenray-ui'),file('proc/777/exe'));
  fs.writeFileSync(file('proc/777/environ'),'RUOPENRAY_PASSWORD='+(load()['ruopenray-ui.main.password']||'')+'\0');
}
switch(mode) {
case 'id': console.log('0'); break;
case 'uname': console.log('x86_64'); break;
case 'df': console.log('Filesystem 1024-blocks Used Available Capacity Mounted\nmock 999999 1 999998 1% /'); break;
case 'pidof': if(fs.existsSync(file('proc/777/exe'))) console.log('777'); else process.exit(1); break;
case 'sleep': case 'sync': case 'apk': case 'xray': break;
case 'flock': {
  if(args.includes('9') && args.includes('-n')) {
    const count=fs.existsSync(file('operation-lock-count')) ? Number(fs.readFileSync(file('operation-lock-count'),'utf8')) : 0;
    fs.writeFileSync(file('operation-lock-count'),String(count+1));
    if(process.env.INSTALLER_TEST_FAILURE==='lock-busy' || (process.env.INSTALLER_TEST_FAILURE==='rollback-lock-busy' && count>0)) process.exit(1);
  }
  break;
}
case 'jsonfilter': {
  const value=JSON.parse(fs.readFileSync(native(args[args.indexOf('-i')+1]),'utf8'));
  const key=args[args.indexOf('-e')+1].replace(/^@\./,'');
  if (value[key] !== undefined) console.log(String(value[key])); else process.exit(1);
  break;
}
case 'uci': {
  const values=load(); const commands=args.filter(value=>value!=='-q');
  const [action,expression]=commands;
  if(action==='get') {
    if(expression==='network.lan.ipaddr') {console.log('192.0.2.1'); break;}
    if(Object.hasOwn(values,expression)) console.log(values[expression]); else process.exit(1);
  } else if(action==='set') {
    const split=expression.indexOf('='); const key=expression.slice(0,split);
    if(process.env.INSTALLER_TEST_FAILURE==='uci' && key==='ruopenray-ui.main.port') process.exit(1);
    values[key]=expression.slice(split+1); save(values);
  } else if(action==='commit') { fs.writeFileSync(file('etc/config/ruopenray-ui'),JSON.stringify(values)); fs.rmSync(file('uci-delta.json'),{force:true}); }
  else if(action==='revert') fs.rmSync(file('uci-delta.json'),{force:true});
  else if(action==='changes') { if(fs.existsSync(file('uci-delta.json'))) console.log('ruopenray-ui.main.host=changed'); }
  else throw new Error('Unexpected UCI operation: '+commands);
  break;
}
case 'curl': case 'wget': {
  const output=native(args[args.indexOf(mode==='curl'?'-o':'-O')+1]);
  const url=args.at(-1);
  if(url.endsWith('/api/version')) {
    if(['readiness','rollback-lock-busy'].includes(process.env.INSTALLER_TEST_FAILURE)) process.exit(22);
    fs.writeFileSync(output,JSON.stringify({ok:true,appVersion:'probe-new'}));
  } else if(url.endsWith('.sha256')) {
    const digest=process.env.INSTALLER_TEST_FAILURE==='checksum'?'0'.repeat(64):crypto.createHash('sha256').update(fs.readFileSync(file('candidate'))).digest('hex');
    fs.writeFileSync(output,digest+'  ruopenray-ui-linux-amd64\n');
    if(process.env.INSTALLER_TEST_FAILURE==='concurrent-settings') {
      const changed=base(); changed['ruopenray-ui.main.port']='9393'; changed['ruopenray-ui.main.host']='192.0.2.2'; changed['ruopenray-ui.main.password']='probe-changed-during-download';
      fs.writeFileSync(file('etc/config/ruopenray-ui'),JSON.stringify(changed));
    }
    if(process.env.INSTALLER_TEST_FAILURE==='pending-update') {
      const data=native(load()['ruopenray-ui.main.data_dir']); fs.mkdirSync(data,{recursive:true}); fs.writeFileSync(path.join(data,'app-update-pending.json'),'{}');
    }
  } else fs.copyFileSync(file('candidate'),output);
  break;
}
case 'service': {
  if(args[0]==='stop') {fs.rmSync(file('proc/777'),{recursive:true,force:true});}
  else if(args[0]==='start') activate();
  break;
}
case 'procd-start': activate(); break;
default: throw new Error('Unexpected mock command: '+mode);
}
`;

function fixture({ existing = true, failure = '', overrides = {}, disabled = false, mirror = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'ruopenray-installer-test-'));
  const target = posix(root);
  const file = (relative) => path.join(root, relative);
  const put = (relative, body, executable = false) => {
    const destination = file(relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, body);
    if (executable) chmodSync(destination, 0o755);
  };
  const initial = {
    'ruopenray-ui.main': 'ruopenray-ui', 'ruopenray-ui.main.enabled': disabled ? '0' : '1',
    'ruopenray-ui.main.host': '192.0.2.1', 'ruopenray-ui.main.port': '9191',
    'ruopenray-ui.main.password': 'probe-existing-password',
    'ruopenray-ui.main.data_dir': `${target}/custom/data`, 'ruopenray-ui.main.backup_dir': `${target}/custom/backups`,
    'ruopenray-ui.main.geo_dir': `${target}/custom/geo`, 'ruopenray-ui.main.active_config': `${target}/custom/xray.json`,
    'ruopenray-ui.main.xray_service': 'custom-xray', 'ruopenray-ui.main.start_delay': '0',
    'ruopenray-ui.main.apply_delay': '7', 'ruopenray-ui.main.go_memlimit': '70MiB', 'ruopenray-ui.main.go_gc': '85',
    'ruopenray-ui.main.download_mirror': mirror ? 'custom' : 'direct',
    'ruopenray-ui.main.mirror_prefix': mirror ? 'https://mirror.example/?url={url}' : '',
    'ruopenray-ui.main.user_extra': 'preserved', 'ruopenray-ui.other.label': 'other section',
  };
  const node = quote(posix(process.execPath));
  const mock = quote(file('mock.cjs').replace(/\\/g, '/'));
  const mockCommand = (name) => `#!/bin/sh\nexec ${node} ${mock} ${quote(name)} "$@"\n`;
  put('mock.cjs', mockSource);
  for (const command of ['id', 'uname', 'df', 'pidof', 'sleep', 'sync', 'apk', 'xray', 'flock', 'jsonfilter', 'uci', 'curl', 'wget']) put(`mocks/${command}`, mockCommand(command), true);
  put('etc/openwrt_release', "DISTRIB_RELEASE='25.12.4'\n");
  mkdirSync(file('usr/share/luci/menu.d'), { recursive: true });
  mkdirSync(file('etc/init.d'), { recursive: true });
  mkdirSync(file('etc/config'), { recursive: true });
  mkdirSync(file('tmp'), { recursive: true });
  const invoke = `${node} ${mock}`;
  put('etc/rc.common', `#!/bin/sh\nscript="$1"; action="$2"\n. "$script"\nconfig_load() { :; }\nconfig_get() { value="$(uci -q get "ruopenray-ui.main.$3" 2>/dev/null || printf '%s' "\${4-}")"; eval "$1=\\$value"; }\nconfig_get_bool() { config_get "$@"; }\nprocd_open_instance() { :; }\nprocd_set_param() { :; }\nprocd_close_instance() { ${invoke} procd-start; }\ncase "$action" in start) start_service;; stop|enable|disable) ${invoke} service "$action";; esac\n`, true);
  const candidate = `#!/bin/sh\nif [ "\${1-}" = --self-check ]; then\n${failure === 'selfcheck' ? 'exit 1' : `printf '%s\\n' '{"ok":true,"version":"probe-new"}'`}\nelse printf '%s\\n' "$*" >>${quote(`${target}/candidate-cli-calls`)}; fi\n`;
  put('candidate', candidate, true);
  const oldBinary = '#!/bin/sh\nprintf old-binary\n';
  if (existing) {
    put('usr/bin/ruopenray-ui', oldBinary, true);
    put('etc/config/ruopenray-ui', JSON.stringify(initial));
    put('custom/xray.json', '{"sentinel":"active-config-unchanged"}');
    put('etc/config/xray', 'native-xray-config-sentinel');
    put('etc/init.d/ruopenray-ui', mockCommand('service'), true);
    for (const relative of ['usr/libexec/ruopenray-recover-app', 'usr/share/luci/menu.d/luci-app-ruopenray.json', 'usr/share/rpcd/acl.d/luci-app-ruopenray.json', 'usr/share/ucode/luci/template/ruopenray/dashboard.ut', 'www/luci-static/resources/view/ruopenray/dashboard.js']) put(relative, `original-${relative}`);
    if (!disabled) {
      put('proc/777/exe', oldBinary);
      put('proc/777/environ', `RUOPENRAY_PASSWORD=${initial['ruopenray-ui.main.password']}\0`);
    }
  }
  // One pass is essential on Linux: target itself is under /tmp and must not
  // be rewritten a second time when replacing the installer's /tmp paths.
  const rewritten = source.replace(/\/(?:etc|usr|www|tmp|proc)\//g, (prefix) => `${target}${prefix}`);
  // Keep the command PATH first even when the parent's Windows PATH is converted
  // by MSYS. The installer itself stays byte-for-byte apart from root rewriting.
  put('install.sh', `export PATH=${quote(`${target}/mocks`)}:"$PATH"\n${rewritten}`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RUOPENRAY_')));
  Object.assign(env, { MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*', INSTALLER_TEST_ROOT: root, INSTALLER_TEST_FAILURE: failure, RUOPENRAY_RELEASE_BASE_URL: 'https://release.example/download', RUOPENRAY_INSTALL_SCENARIOS: existing ? undefined : '0', ...overrides });
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const result = spawnSync(shell, [file('install.sh')], { cwd: root, encoding: 'utf8', env, timeout: 90000 });
  const calls = existsSync(file('calls.jsonl')) ? readFileSync(file('calls.jsonl'), 'utf8').trim().split('\n').map((row) => JSON.parse(row)) : [];
  return {
    root, file, initial, oldBinary, candidate, result, calls,
    config: () => JSON.parse(readFileSync(file('etc/config/ruopenray-ui'), 'utf8')),
    cleanup() {
      const resolved = path.resolve(root);
      assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
      assert.ok(path.basename(resolved).startsWith('ruopenray-installer-test-'));
      rmSync(resolved, { recursive: true, force: true });
    },
  };
}

function using(options, verify) {
  const f = fixture(options);
  try { verify(f); } finally { f.cleanup(); }
}
const success = (f) => assert.equal(f.result.status, 0, `${f.result.error || ''}\n${f.result.stdout}\n${f.result.stderr}`);
const failed = (f) => assert.notEqual(f.result.status, 0, `${f.result.stdout}\n${f.result.stderr}`);
function originalFilesRestored(f) {
  assert.equal(readFileSync(f.file('usr/bin/ruopenray-ui'), 'utf8'), f.oldBinary);
  assert.deepEqual(f.config(), f.initial);
  assert.match(readFileSync(f.file('etc/init.d/ruopenray-ui'), 'utf8'), /service/);
  assert.equal(readFileSync(f.file('custom/xray.json'), 'utf8'), '{"sentinel":"active-config-unchanged"}');
  for (const relative of ['usr/libexec/ruopenray-recover-app', 'usr/share/luci/menu.d/luci-app-ruopenray.json', 'usr/share/rpcd/acl.d/luci-app-ruopenray.json', 'usr/share/ucode/luci/template/ruopenray/dashboard.ut', 'www/luci-static/resources/view/ruopenray/dashboard.js']) assert.equal(readFileSync(f.file(relative), 'utf8'), `original-${relative}`);
  assert.equal(readFileSync(f.file('proc/777/exe'), 'utf8'), f.oldBinary);
  assert.equal(existsSync(f.file('uci-delta.json')), false, 'failed UCI staging must not overlay restored config');
}

test('installer upgrade preserves UCI options, extra sections, active Xray scheme and source choice', () => using({}, (f) => {
  success(f);
  assert.deepEqual(f.config(), f.initial);
  assert.equal(readFileSync(f.file('usr/bin/ruopenray-ui'), 'utf8'), f.candidate);
  assert.equal(readFileSync(f.file('custom/xray.json'), 'utf8'), '{"sentinel":"active-config-unchanged"}');
  assert.equal(readFileSync(f.file('etc/config/xray'), 'utf8'), 'native-xray-config-sentinel');
  assert.equal(existsSync(f.file('candidate-cli-calls')), false);
  assert.ok(readdirSync(f.file('usr/bin')).some((name) => name.startsWith('ruopenray-ui.backup-')));
  assert.equal(f.calls.some((row) => row.mode === 'uci' && row.args.some((arg) => arg.startsWith('xray.'))), false);
}));

test('installer explicit overrides replace only the requested existing values', () => using({ overrides: { RUOPENRAY_PORT: '9292', RUOPENRAY_HOST: '127.0.0.1', RUOPENRAY_PASSWORD: "probe-'quoted&password" } }, (f) => {
  success(f);
  assert.deepEqual(f.config(), { ...f.initial, 'ruopenray-ui.main.port': '9292', 'ruopenray-ui.main.host': '127.0.0.1', 'ruopenray-ui.main.password': "probe-'quoted&password" });
}));

test('settings changed during download are read again under the shared operation lock', () => using({ failure: 'concurrent-settings' }, (f) => {
  success(f);
  assert.deepEqual(f.config(), { ...f.initial, 'ruopenray-ui.main.port': '9393', 'ruopenray-ui.main.host': '192.0.2.2', 'ruopenray-ui.main.password': 'probe-changed-during-download' });
  const lockIndex=f.calls.findIndex((row) => row.mode==='flock' && row.args.includes('9') && row.args.includes('-n'));
  assert.ok(lockIndex>f.calls.findIndex((row) => row.mode==='curl' && row.args.at(-1).endsWith('.sha256')));
}));

for (const failure of ['lock-busy', 'pending-update']) test(`installer ${failure} detected after download stops before replacing the panel`, () => using({ failure }, (f) => {
  failed(f); originalFilesRestored(f);
  assert.equal(f.calls.some((row) => row.mode === 'service' && row.args[0] === 'stop'), false);
}));

for (const failure of ['selfcheck', 'checksum']) test(`installer ${failure} failure preserves the current installation before service stop`, () => using({ failure }, (f) => {
  failed(f); originalFilesRestored(f);
  assert.equal(f.calls.some((row) => row.mode === 'service' && row.args[0] === 'stop'), false);
}));

for (const failure of ['start', 'readiness', 'uci']) test(`installer ${failure} failure restores binary, UCI, launcher, helpers and original service`, () => using({ failure }, (f) => {
  failed(f); originalFilesRestored(f);
  assert.match(f.result.stdout, /Восстанавливаю прежнюю панель/);
}));

test('failed fresh install removes its candidate, starter config and new service files', () => using({ existing: false, failure: 'readiness' }, (f) => {
  failed(f);
  for (const relative of ['usr/bin/ruopenray-ui', 'etc/config/ruopenray-ui', 'etc/init.d/ruopenray-ui', 'etc/xray/config.json', 'usr/libexec/ruopenray-recover-app']) assert.equal(existsSync(f.file(relative)), false, relative);
  assert.equal(f.calls.some((row) => row.mode === 'service' && row.args[0] === 'enable'), false);
}));

test('rollback blocked by another operation retains recovery copies and does not overwrite the running candidate', () => using({ failure: 'rollback-lock-busy' }, (f) => {
  failed(f);
  assert.match(f.result.stderr,/Откат не начат, копии сохранены/);
  assert.equal(readFileSync(f.file('usr/bin/ruopenray-ui'),'utf8'),f.candidate);
  assert.equal(readFileSync(f.file('proc/777/exe'),'utf8'),f.candidate);
  const recovery=readdirSync(f.file('usr/bin')).find((name)=>name.startsWith('.ruopenray-install.'));
  assert.ok(recovery);
  assert.equal(readFileSync(f.file(`usr/bin/${recovery}/1`),'utf8'),f.oldBinary);
}));

test('fresh install checks readiness before enabling the new panel', () => using({ existing: false }, (f) => {
  success(f);
  assert.equal(readFileSync(f.file('usr/bin/ruopenray-ui'), 'utf8'),f.candidate);
  assert.equal(f.config()['ruopenray-ui.main.enabled'],'1');
  assert.ok(JSON.parse(readFileSync(f.file('etc/xray/config.json'),'utf8')).outbounds.length>0);
  const enabledIndex=f.calls.findIndex((row) => row.mode==='service' && row.args[0]==='enable');
  assert.ok(enabledIndex>f.calls.findLastIndex((row) => row.mode==='curl' && row.args.at(-1).endsWith('/api/version')));
}));

test('an intentionally disabled existing panel stays disabled after upgrade', () => using({ disabled: true }, (f) => {
  success(f); assert.deepEqual(f.config(), f.initial);
  assert.equal(f.calls.some((row) => ['service','procd-start'].includes(row.mode) && (row.mode === 'procd-start' || ['start','enable'].includes(row.args[0]))), false);
}));

test('binary mirror uses encoded URL while SHA-256 is downloaded from independent release origin', () => using({ mirror: true }, (f) => {
  success(f);
  const downloads = f.calls.filter((row) => row.mode === 'curl').map((row) => row.args.at(-1));
  assert.ok(downloads.includes('https://mirror.example/?url=https%3A%2F%2Frelease.example%2Fdownload%2Fruopenray-ui-linux-amd64'));
  assert.ok(downloads.includes('https://release.example/download/ruopenray-ui-linux-amd64.sha256'));
  assert.equal(downloads.some((url) => url.startsWith('https://mirror.example/') && url.includes('sha256')), false);
}));

test('LuCI direct panel links use HTTP for HTTPS LuCI and bracket IPv6 hosts', () => {
  const launcher = readFileSync(new URL('../packaging/openwrt/files/www/luci-static/resources/view/ruopenray/dashboard.js', import.meta.url), 'utf8');
  const helpers = launcher.slice(launcher.indexOf('function normalizeHost'), launcher.indexOf('return view.extend'));
  const panelUrl = new Function('window', `${helpers}; return panelUrl;`)({ location: { protocol: 'https:', hostname: '192.0.2.1' } });
  assert.equal(panelUrl('0.0.0.0', '9090'), 'http://192.0.2.1:9090/');
  assert.equal(panelUrl('2001:db8::1', '9091'), 'http://[2001:db8::1]:9091/');
});
