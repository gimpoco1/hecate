import { registerPlugin } from '@capacitor/core'

interface GoogleSignInPlugin {
  signIn(options: { url: string }): Promise<{ callbackURL: string }>
}

export const GoogleSignIn = registerPlugin<GoogleSignInPlugin>('GoogleSignIn')
