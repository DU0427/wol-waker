import type { CapacitorConfig } from '@capacitor/cli';

// Android 打包前先把 src/ui 同步为 Web 资源：npx cap add android && npx cap sync
const config: CapacitorConfig = {
  appId: 'com.wolwaker.app',
  appName: 'wol-waker',
  webDir: 'src/ui',
  android: {
    // UDP 直发由 android/app/src/main/java/com/wolwaker/app/WolAndroidBridge.java 实现，
    // 经 MainActivity 注入为 window.WolAndroid，再由 src/ui/native-android.js 适配成 WolNative
    allowMixedContent: false
  }
};

export default config;
