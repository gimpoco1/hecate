import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { mdiApple } from '@mdi/js'
import { isSignInCancellation, signInWithApple, signInWithGoogle } from '../auth'

type Provider = 'google' | 'apple'
type Props = { disabled: boolean; onPendingChange: (pending: boolean) => void }
const signInActions: Record<Provider, () => Promise<void>> = { google: signInWithGoogle, apple: signInWithApple }

/** Shared account entry: each provider signs in existing users or creates their first account. */
export function SocialSignIn({ disabled, onPendingChange }: Props) {
  const [pending, setPending] = useState<Provider | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const onAuthError = (event: Event): void => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') setError(event.detail)
    }
    window.addEventListener('hecate:auth-error', onAuthError)
    return () => window.removeEventListener('hecate:auth-error', onAuthError)
  }, [])

  const signIn = async (provider: Provider): Promise<void> => {
    setError('')
    setPending(provider)
    onPendingChange(true)
    try { await signInActions[provider]() }
    catch (failure) {
      if (!isSignInCancellation(failure)) {
        setError(failure instanceof Error ? failure.message : 'Sign-in could not be started. Please try again.')
      }
    } finally {
      setPending(null)
      onPendingChange(false)
    }
  }

  return (
    <div className="social-signin" aria-label="Sign in or create an account">
      <button type="button" className="social-signin__button social-signin__button--google"
        data-testid="auth-google" disabled={disabled || pending !== null} aria-busy={pending === 'google'}
        onClick={() => void signIn('google')}>
        <img src="/auth/google-g.png" width="20" height="20" alt="" aria-hidden="true" />
        <span>{pending === 'google' ? 'Connecting to Google…' : 'Continue with Google'}</span>
      </button>
      {Capacitor.getPlatform() === 'ios' && (
        <button type="button" className="social-signin__button social-signin__button--apple"
          data-testid="auth-apple" disabled={disabled || pending !== null} aria-busy={pending === 'apple'}
          onClick={() => void signIn('apple')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d={mdiApple} /></svg>
          <span>{pending === 'apple' ? 'Signing in with Apple…' : 'Continue with Apple'}</span>
        </button>
      )}
      {error && <p className="form-message form-message--error" role="alert" data-testid="auth-social-error">{error}</p>}
    </div>
  )
}
