# wol-waker · 远程唤醒电脑

Windows + Android 共用一套代码，**UDP 直发魔术包，不需要自建后端 serve**。

## 原理（一句话）

App 自己 `DNS 解析域名 -> UDP 发 FF*6 + MAC*16 到 域名:9`，路由器按你配好的转发规则送到电脑网卡，网卡待机供电监听，开机。

## 目录

```
wol-waker/
  src/core/wol.js        组包+校验+重试（双端共用，零依赖）
  src/core/core.test.mjs 自测（node 直接跑）
  src/ui/                共用界面（设备管理/一键唤醒/日志/状态轮询）
  electron/              Windows 真发（Node dgram + dns + net）
  platforms/android-bridge.kt  Android 真发（Kotlin UDP 插件）
```

## 先验证链路（不装任何东西）

```bash
node src/core/core.test.mjs
```

再真发一个包测试（把 MAC/域名换成你的）：

```bash
node -e "const d=require('node:dgram');const mac=Buffer.from('AABBCCDDEEFF','hex');const p=Buffer.concat([Buffer.alloc(6,0xff),...Array(16).fill(mac)]);const s=d.createSocket('udp4');s.send(p,9,'你的域名',e=>{console.log(e||'已发送');s.close();})"
```

电脑亮了 = 转发 + 静态 ARP 都对了。

## Windows 运行

```bash
npm install
npm run electron
```

打包便携版：`npm run dist:win`，产物在 `dist/`。

## Android 运行

1. `npm install`
2. `npx cap add android && npx cap sync`（把 `src/ui` 同步进原生工程）
3. 用 Android Studio 打开 `android/`，把 `platforms/android-bridge.kt` 的 `WolPlugin` 放入对应包名并注册
4. 真机调试：同一页面点“唤醒”，日志会显示 `已发送 102 字节 -> ...`

## 上线前检查清单

- [ ] 路由器：外网端口 -> `192.168.1.255:9`（广播）或静态 ARP 绑定
- [ ] BIOS：WOL / Power On By PCI-E 打开
- [ ] 网卡驱动：允许魔术封包唤醒打开，Windows 快启关闭
- [ ] 运营商封 9 就换 7 或 9000，转发规则跟着改
- [ ] 魔术包明文，只给自己用；给别人用要在前面加口令
