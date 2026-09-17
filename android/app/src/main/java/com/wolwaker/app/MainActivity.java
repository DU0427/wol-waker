package com.wolwaker.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * 在 Capacitor 的 WebView 上挂一个原生 JS 接口 WolAndroid，
 * 供前端 src/ui/native-android.js 调用（UDP 直发魔术包，无需后端）。
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 桥接需要 WebView 引用：异步结果通过 evaluateJavascript 回调回页面
        getBridge().getWebView().addJavascriptInterface(new WolAndroidBridge(getBridge().getWebView()), "WolAndroid");
    }
}
