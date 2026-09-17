// Windows 端 UDP 直发（纯 Node，不依赖 Electron，便于直接跑测试）
//
// 两个坑：
// 1. 发往广播地址（255.255.255.255 或 x.x.x.255）必须先把 SO_BROADCAST 打开，
//    否则 Windows/Linux 都会以 EACCES 失败（局域网直唤、广播唤醒都会挂）。
// 2. Node 的 socket handle 是懒创建的：未 bind 就调 setBroadcast 会报 EBADF，
//    所以顺序必须是 createSocket -> bind -> setBroadcast -> send。
'use strict';

const dgram = require('node:dgram');
const dns = require('node:dns').promises;

/** 发一次魔术包，返回域名解析到的 IP */
async function sendUdpOnce(packet, host, port) {
  const ip = (await dns.lookup(host)).address;
  await new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const fail = (err) => { try { sock.close(); } catch { /* 可能已关闭 */ } reject(err); };
    sock.once('error', fail);
    sock.bind(() => {
      try { sock.setBroadcast(true); } catch { /* 单播目标不需要广播权限 */ }
      sock.send(Buffer.from(packet), port, ip, (err) => {
        try { sock.close(); } catch { /* 可能已关闭 */ }
        if (err) reject(err); else resolve();
      });
    });
  });
  return ip;
}

module.exports = { sendUdpOnce };
