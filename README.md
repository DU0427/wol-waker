# wol-waker · 远程唤醒电脑

Windows + Android 共用一套代码，**UDP 直发魔术包，不需要自建后端 serve**。

## 原理（一句话）

App 自己 `DNS 解析域名 -> UDP 发 FF*6 + MAC*16 到 域名:9`，路由器按你配好的转发规则送到电脑网卡，网卡待机供电监听，开机。

## 直接下载安装

**安卓 APK（推荐手机用）**

- 下载地址：<https://github.com/DU0427/wol-waker/releases/download/apk-latest/app-debug.apk>
- 手机浏览器打开即下，安装时允许「未知来源」。这是 debug 测试包，用系统调试证书签名。
- 每次 main 分支推送后，GitHub Actions 会自动重新构建并覆盖更新该 Release。

**Windows 便携版**

- 本地 `npm run dist:win` 生成 `dist/wol-waker-0.1.0-win-x64.exe`，双击即用，无需安装。

## 图标

- 设计源文件：`design/icon.svg`（完整图标）、`design/icon-fg.svg`（自适应前景）
- 含义：绿色电源符号 + 右侧两道信号弧线 = 通过网络远程开机
- 生成：`npm run icons`（Electron 渲染 SVG → 安卓各密度 mipmap + 透明前景 + Windows `build/icon.ico`）

## 目录

```
wol-waker/
  src/core/wol.js          组包+校验+重试（双端共用，零依赖）
  src/core/core.test.mjs   自测（node 直接跑）
  src/ui/                  共用界面（设备管理/一键唤醒/日志/状态轮询）
  src/ui/native-android.js 安卓原生桥接适配（WolAndroid -> WolNative）
  electron/                Windows 真发（Node dgram + dns + net）
  android/                 Capacitor 安卓工程 + Java 原生 UDP 桥接
  design/                  图标 SVG 源文件
  scripts/                 图标渲染/打包、web 资源同步脚本
  .github/workflows/       安卓 APK 云端自动构建
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

## Android 本地构建（需要 Android SDK + JDK 17）

```bash
npm install
npm run cap:sync          # 把 src/ui 同步进 android 工程
cd android
./gradlew assembleDebug   # 产物：app/build/outputs/apk/debug/app-debug.apk
```

没有本地环境也行：直接推 main，`.github/workflows/android.yml` 会在云端构建并把 APK 发到 `apk-latest` Release。

原生桥接说明：`MainActivity` 通过 `addJavascriptInterface` 注入 `window.WolAndroid`，
`src/ui/native-android.js` 再把它适配成与 Electron 一致的 `window.WolNative`，
所以同一套 UI 在两端都能真发 UDP。UDP 直发只需 `INTERNET` 权限。

## 上线前检查清单

- [ ] 路由器：外网端口 -> `192.168.1.255:9`（广播）或静态 ARP 绑定
- [ ] BIOS：WOL / Power On By PCI-E 打开
- [ ] 网卡驱动：允许魔术封包唤醒打开，Windows 快启关闭
- [ ] 运营商封 9 就换 7 或 9000，转发规则跟着改
- [ ] 魔术包明文，只给自己用；给别人用要在前面加口令
