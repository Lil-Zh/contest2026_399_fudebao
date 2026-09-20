/**
 * 非交互式部署脚本：自动选择 OVxiaomi_s4 圆屏模拟器（2026-08-27 定版：用户全面转圆屏开发，勿改回方屏 AVD），
 * 构建 rpk → 附着运行中的模拟器 → 安装并启动应用。
 * 用法: node auto-start.cjs
 */
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (name, ...rest) {
  if (name === '@inquirer/prompts') {
    return {
      select: async (opts) => {
        const choices = opts.choices || [];
        const choice = choices.find(c => c.value === 'OVxiaomi_s4') || choices[0];
        console.log(`[auto] select "${opts.message}" -> ${choice && choice.value}`);
        return choice.value;
      },
      confirm: async (opts) => {
        console.log(`[auto] confirm "${opts.message}" -> true`);
        return true;
      }
    };
  }
  return origRequire.call(this, name, ...rest);
};

const projectPath = __dirname;

// IDE 重启模拟器时会重写 VVD 的 config.ini 并删掉 image.sysdir.2 字段，
// 导致 aiot 工具链判定模拟器不可用；启动前自动补回。
function healVvdConfig() {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const cfgPath = path.join(os.homedir(), '.vela', 'vvd', 'OVxiaomi_s4.vvd', 'config.ini');
  try {
    let text = fs.readFileSync(cfgPath, 'utf-8');
    const sysdir1 = (text.match(/^image\.sysdir\.1=(.+)$/m) || [])[1];
    const sysdir2 = (text.match(/^image\.sysdir\.2=(.*)$/m) || [])[1];
    if (sysdir1 && sysdir2 !== sysdir1) {
      if (text.match(/^image\.sysdir\.2=.*$/m)) {
        text = text.replace(/^image\.sysdir\.2=.*$/m, 'image.sysdir.2=' + sysdir1);
      } else {
        text = text.replace(/\r?\n?$/, '\r\nimage.sysdir.2=' + sysdir1 + '\r\n');
      }
      fs.writeFileSync(cfgPath, text);
      console.log('[auto] healed image.sysdir.2 ->', sysdir1);
    }
  } catch (e) {
    console.log('[auto] vvd config heal skipped:', e.message);
  }
}
healVvdConfig();

const VelaUxStarter = require('aiot-toolkit/lib/starter/VelaUxStarter').default;
const starter = new VelaUxStarter('start', 'auto');

const options = {
  disableNSH: false,
  watch: false,
  openVNC: false,
  mode: 'development'
};

const PKG = 'com.lynxtracker.collector';
const RPK = require('path').join(require('path').dirname(projectPath), '.temp_lynx_tracker_vela', 'dist', PKG + '.debug.0.2.0.rpk');
// RPK 文件暂存于 quickapp 目录，但运行时从 /data/app 解压目录加载资源。
const APP_DIR = '/data/app/' + PKG;

// 统一的 adb 工具函数
const { execFileSync } = require('child_process');
const ADB_EXE = require('path').join(projectPath, 'node_modules', '@aiot-toolkit', 'emulator', 'node_modules', '@miwt', 'adb', 'bin', 'win', 'adb.exe');
function adbRun(args, opts) {
  return execFileSync(ADB_EXE, args, Object.assign({ encoding: 'utf-8', timeout: 30000 }, opts)).trim();
}
function adbEmulatorSerial() {
  try {
    const list = adbRun(['devices']).split('\n').slice(1).map(l => l.split('\t')[0]).filter(s => s && s !== 'List');
    const requested = process.env.LYNX_EMULATOR_SERIAL;
    if (requested) {
      if (list.includes(requested)) return requested;
      console.log('[auto] requested emulator is unavailable:', requested);
      return null;
    }
    if (list.length > 1) console.log('[auto] multiple emulators detected; defaulting to', list[0], '(set LYNX_EMULATOR_SERIAL to choose one)');
    return list.find(s => s.startsWith('emulator-')) || null;
  } catch (e) { return null; }
}

// 若模拟器未运行，先"分离式"冷启动（不作为本脚本的子进程，
// 避免脚本退出/任务清理时把模拟器整树带走）；之后 starter 走附着模式
async function ensureEmulatorRunning() {
  const { spawn } = require('child_process');
  if (adbEmulatorSerial()) { console.log('[auto] emulator already running (adb)'); return true; }
  const VelaAvdUtils = require('aiot-toolkit/lib/utils/VelaAvdUtils').default;
  const cmd = await VelaAvdUtils.vvdManager.getVvdStartCmd({ vvdName: 'OVxiaomi_s4', origin: 'ide' });
  console.log('[auto] detached cold-start:', cmd);
  const parts = cmd.split(' ');
  const bin = parts.shift();
  spawn(bin, parts, { detached: true, stdio: 'ignore', shell: true }).unref();
  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (adbEmulatorSerial()) { console.log('[auto] emulator is up (adb)'); return true; }
  }
  console.log('[auto] WARNING: emulator not detected within 90s');
  return false;
}

// 工具链偶尔拿旧 adb 序列号执行 push/unzip 导致静默失败；部署后强制重装兜底
async function ensureInstalled() {
  const serial = adbEmulatorSerial();
  if (!serial) { console.log('[auto] no emulator device found, skip ensure'); return; }
  if (!require('fs').existsSync(RPK)) { console.log('[auto] rpk not built, skip ensure'); return; }
  console.log('[auto] deploy on', serial, '...');
  const targetRpk = '/data/quickapp/app/' + PKG + '.rpk';
  let registered = false;
  try {
    adbRun(['-s', serial, 'shell', 'ls', APP_DIR + '/manifest.json'], { timeout: 5000 });
    registered = true;
  } catch (e) {}
  adbRun(['-s', serial, 'push', RPK, targetRpk]);
  if (registered) {
    // 已注册的开发包只需替换解压后的资源。避免该镜像在同包覆盖 pm install
    // 时卡死；保留模拟器中的比赛恢复数据，符合日常调试需求。
    try { adbRun(['-s', serial, 'shell', 'am', 'stop', PKG], { timeout: 5000 }); } catch (e) {}
    adbRun(['-s', serial, 'shell', 'unzip', '-o', targetRpk, '-d', APP_DIR]);
    console.log('[auto] refreshed registered package');
  } else {
    // 首次安装必须等待 Quick App 运行时就绪。ADB 在线早于该运行时，冷启动
    // 时 pm 会返回 255，因此以有限重试而不是假定应用已经启动。
    await new Promise(resolve => setTimeout(resolve, 6000));
    let installed = false;
    let installError = null;
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        adbRun(['-s', serial, 'shell', 'pm', 'install', targetRpk], { timeout: 30000 });
        installed = true;
        break;
      } catch (e) {
        installError = e;
        console.log(`[auto] Quick App runtime not ready (install ${attempt}/8), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    if (!installed) throw installError || new Error('Quick App runtime did not become ready');
    console.log('[auto] installed new package');
  }
  adbRun(['-s', serial, 'shell', 'am', 'start', PKG], { timeout: 10000 });
  console.log('[auto] started', PKG);
}

(async () => {
  try { await ensureEmulatorRunning(); } catch (e) { console.log('[auto] ensureEmulatorRunning error:', e.message); }
  starter.start(projectPath, options).then(
    async () => {
      console.log('[auto] START OK');
    },
    (err) => {
      console.error('[auto] START FAILED:', err && (err.stack || err.message || err));
    }
  ).finally(async () => {
    // 无论 starter 成败，只要 rpk 已构建且模拟器在线就强制安装并启动
    try { await ensureInstalled(); } catch (e) { console.log('[auto] ensureInstalled error:', e.message); }
    setTimeout(() => process.exit(0), 3000);
  });
})();
