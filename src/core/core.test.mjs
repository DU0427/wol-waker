// wol-waker 核心自测：node src/core/core.test.mjs（零依赖）
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeMac, buildMagicPacket, validateTarget, sendWithRetry } = require('./wol.js');

// 1. 三种 MAC 写法归一化
assert.equal(normalizeMac('aa:bb:cc:dd:ee:ff'), 'AA:BB:CC:DD:EE:FF');
assert.equal(normalizeMac('AA-BB-CC-DD-EE-FF'), 'AA:BB:CC:DD:EE:FF');
assert.equal(normalizeMac('aabbccddeeff'), 'AA:BB:CC:DD:EE:FF');

// 2. 魔术包：102 字节，包头 6 个 FF，第 7 字节起循环 MAC
const pkt = buildMagicPacket('AA:BB:CC:DD:EE:FF');
assert.equal(pkt.length, 102);
assert.deepEqual([...pkt.slice(0, 6)], [255, 255, 255, 255, 255, 255]);
assert.deepEqual([...pkt.slice(6, 12)], [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);

// 3. SecureOn：108 字节
assert.equal(buildMagicPacket('AA:BB:CC:DD:EE:FF', '11:22:33:44:55:66').length, 108);

// 4. 非法输入抛中文错
assert.throws(() => normalizeMac('zz'), /MAC 非法/);
assert.throws(() => validateTarget({ host: '', port: 9, mac: 'AA:BB:CC:DD:EE:FF' }), /域名/);
assert.throws(() => validateTarget({ host: 'x.com', port: 99999, mac: 'AA:BB:CC:DD:EE:FF' }), /端口/);

// 5. 重试辅助：前 2 次失败第 3 次成功
let calls = 0;
const r = await sendWithRetry(async () => { calls++; if (calls < 3) throw new Error('udp fail'); }, pkt, { retries: 3, delayMs: 1 });
assert.equal(r.attempts, 3);

console.log('core test passed: 5/5');
