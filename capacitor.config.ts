import type { CapacitorConfig } from '@capacitor/cli'
import type { KeyboardResize } from '@capacitor/keyboard'

const config: CapacitorConfig = {
  appId: 'com.gimpoco.hecate',
  appName: 'Hecate',
  webDir: 'dist',
  android: {
    useLegacyBridge: true,
  },
  plugins: {
    Keyboard: {
      resize: 'none' as KeyboardResize,
    },
  },
}

export default config
