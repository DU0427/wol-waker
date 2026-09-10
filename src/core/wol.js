// wol-waker 核心：魔术包组包（Windows + Android 共用，纯 JS 无依赖）
// 原理：UDP 直发 FF*6 + MAC*16 到 域名:9，无需自建后端 serve

'use strict';

/**
 * 把各种 MAC 写法归一化为 AA:BB:CC:DD:EE:FF（大写冒号分隔）
 * @param {string} mac
 * @returns {string}
 */
function normalizeMac(mac) {
  if (typeof mac !== 'string') throw new Error('MAC 必须是字符串');
  const hex = mac.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 12) throw new Error('MAC 非法：需要 12 位十六进制，例如 AA:BB:CC:DD:EE:FF');
  return hex.match(/.{2}/g).join(':');
}

/**
 * MAC 转 6 字节
 * @param {string} mac
 * @returns {Uint8Array}
 */
function parseMacBytes(mac) {
  const norm = normalizeMac(mac);
  const out = new Uint8Array(6);
  norm.split(':').forEach((b, i) => { out[i] = parseInt(b, 16); });
  return out;
}

/**
 * 组魔术包：6×0xFF + MAC×16 = 102 字节；带 SecureOn 密码则追加 6 字节 = 108
 * @param {string} mac
 * @param {string} [secureOn] 可选，同样支持 MAC 格式
 * @returns {Uint8Array}
 */
function buildMagicPacket(mac, secureOn) {
  const macBytes = parseMacBytes(mac);
  const hasPassword = secureOn !== undefined && secureOn !== null && String(secureOn).trim() !== '';
  const total = hasPassword ? 108 : 102;
  const pkt = new Uint8Array(total);
  pkt.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) pkt.set(macBytes, 6 + i * 6);
  if (hasPassword) pkt.set(parseMacBytes(String(secureOn)), 102);
  return pkt;
}

/**
 * 校验唤醒目标
 * @param {{host:string, port:number, mac:string}} target
 * @returns {{host:string, port:number, mac:string}}
 */
function validateTarget(target) {
  if (!target || typeof target !== 'object') throw new Error('目标不能为空');
  const host = String(target.host || '').trim();
  if (!host) throw new Error('域名/IP 不能为空');
  const port = Number(target.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口非法：1-65535，默认 9');
  const mac = normalizeMac(target.mac || '');
  return { host, port, mac };
}

/**
 * 带重试的发送辅助：实际 UDP 发送由各平台适配器注入
 * @param {(packet:Uint8Array)=>Promise<void>} sendOnce
 * @param {Uint8Array} packet
 * @param {{retries?:number, delayMs?:number}} [opts]
 */
async function sendWithRetry(sendOnce, packet, opts) {
  const retries = (opts && opts.retries) || 3;
  const delayMs = (opts && opts.delayMs) || 500;
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sendOnce(packet);
      return { ok: true, attempts: attempt };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

module.exports = { normalizeMac, parseMacBytes, buildMagicPacket, validateTarget, sendWithRetry };
// 浏览器直引时挂到 window（Electron/Capacitor 的 WebView 可直接用）
if (typeof window !== 'undefined') window.WolCore = module.exports;
