// Electron 主进程：Windows 端 UDP 直发（无后端 serve）
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const dgram = require('node:dgram');
const dns = require('node:dns').promises;
const net = require('node:net');
const { buildMagicPacket, validateTarget } = require('../src/core/wol.js');

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#0b0f16',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadFile(path.join(__dirname, '..', 'src', 'ui', 'index.html'));
}

async function sendUdpOnce(packet, host, port) {
  const ip = await dns.lookup(host).then((r) => r.address);
  await new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.send(Buffer.from(packet), port, ip, (err) => {
      sock.close();
      err ? reject(err) : resolve(ip);
    });
  }).then((ip) => ip);
}

ipcMain.handle('wol:send', async (_evt, target) => {
  const t = validateTarget(target);
  const packet = buildMagicPacket(t.mac, target.secureOn);
  let lastIp = t.host;
  let attempts = 0;
  for (let i = 1; i <= 3; i++) {
    attempts = i;
    try {
      lastIp = await sendUdpOnce(packet, t.host, t.port);
      break;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { ok: true, bytes: packet.length, resolvedIp: lastIp, attempts };
});

ipcMain.handle('wol:check', async (_evt, { host, tcpPorts, timeoutMs }) => {
  const ports = tcpPorts && tcpPorts.length ? tcpPorts : [3389, 22];
  const timeout = timeoutMs || 3000;
  const t0 = Date.now();
  const ip = await dns.lookup(host).then((r) => r.address).catch(() => host);
  for (const port of ports) {
    const online = await new Promise((resolve) => {
      const s = new net.Socket();
      s.setTimeout(timeout);
      s.once('connect', () => { s.destroy(); resolve(true); });
      s.once('timeout', () => { s.destroy(); resolve(false); });
      s.once('error', () => { s.destroy(); resolve(false); });
      s.connect(port, ip);
    });
    if (online) return { online: true, latencyMs: Date.now() - t0 };
  }
  return { online: false, latencyMs: Date.now() - t0 };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
