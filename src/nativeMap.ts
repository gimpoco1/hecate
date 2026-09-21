import { Capacitor, registerPlugin } from '@capacitor/core'

type NativeMapPlugin = {
  present(options: { latitude: number; longitude: number; zoom: number; bearing: number; pitch: number }): Promise<void>
  dismiss(): Promise<void>
  addListener(eventName: 'dismissed', listenerFunc: () => void): Promise<{ remove: () => Promise<void> }>
}

export const NativeMap = registerPlugin<NativeMapPlugin>('NativeMap')

export function supportsNative3DAppleMaps() {
  return Capacitor.getPlatform() === 'ios'
}
