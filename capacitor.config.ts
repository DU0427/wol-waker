import type { CapacitorConfig } from '@capacitor/cli';

// Android 打包前先把 src/ui 同步为 Web 资源：npx cap add android && npx cap sync
const config: CapacitorConfig = {
  appId: 'com.wolwaker.app',
  appName: 'wol-waker',
  webDir: 'src/ui',
  android: {
    // 配合 platforms/android-bridge.kt 里的 Wol 插件真发 UDP
    allowMixedContent: false
  }
};

export default config;
