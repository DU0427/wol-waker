// wol-waker 核心类型声明（给 TS 编辑器用，运行时以 wol.js 为准）
export interface WolTarget {
  host: string;
  port: number;
  mac: string;
  secureOn?: string;
}
export interface WolSendResult {
  ok: boolean;
  bytes: number;
  resolvedIp: string;
  attempts: number;
}
export declare function normalizeMac(mac: string): string;
export declare function parseMacBytes(mac: string): Uint8Array;
export declare function buildMagicPacket(mac: string, secureOn?: string): Uint8Array;
export declare function validateTarget(target: WolTarget): WolTarget;
export declare function sendWithRetry(
  sendOnce: (packet: Uint8Array) => Promise<void>,
  packet: Uint8Array,
  opts?: { retries?: number; delayMs?: number }
): Promise<{ ok: boolean; attempts: number }>;

// 平台桥接（Electron preload / Capacitor 原生插件统一暴露）
export interface WolNativeBridge {
  sendMagicPacket(target: WolTarget): Promise<WolSendResult>;
  checkHost(target: { host: string; tcpPorts?: number[]; timeoutMs?: number }): Promise<{
    online: boolean;
    latencyMs: number;
  }>;
}
declare global {
  interface Window {
    WolNative?: WolNativeBridge;
  }
}
