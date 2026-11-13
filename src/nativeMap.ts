import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

type NativeMapPlugin = {
  present(options: { latitude: number; longitude: number; zoom: number; bearing: number; pitch: number; closeLabel: string }): Promise<void>
  dismiss(): Promise<void>
  addListener(eventName: "dismissed", listenerFunc: () => void): Promise<PluginListenerHandle>
};

export const NativeMap = registerPlugin<NativeMapPlugin>("NativeMap");

export function supportsNative3DAppleMaps(): boolean {
  return Capacitor.getPlatform() === "ios";
}
