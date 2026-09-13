import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { authRedirectUrl } from '../auth'
import { isSyncConfigured, supabase } from '../storage'
import { XIcon } from './Icons'

type Props = { open: boolean; onClose: () => void }
type SignInMethod = 'password' | 'link'
type PasswordIntent = 'signin' | 'signup'
type MessageTone = 'success' | 'error'

export function SyncSheet({ open, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [signInMethod, setSignInMethod] = useState<SignInMethod>('password')
  const [passwordIntent, setPasswordIntent] = useState<PasswordIntent>('signin')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<MessageTone>('success')
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(isSyncConfigured)
  const [authPending, setAuthPending] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false)
      return
    }
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    let active = true
    setAuthLoading(true)
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setUser(data.session?.user ?? null)
      setMessage(error?.message ?? '')
      setMessageTone(error ? 'error' : 'success')
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      if (session?.user) setMessage('')
      setAuthLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [open])

  if (!open) return null

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setAuthPending(true)
    setMessage('')
    setMessageTone('success')
    try {
      if (signInMethod === 'password') {
        if (passwordIntent === 'signup') {
          if (password.length < 8) {
            setMessage('Use at least 8 characters for your password.')
            setMessageTone('error')
            return
          }
          if (password !== confirmPassword) {
            setMessage('The passwords do not match.')
            setMessageTone('error')
            return
          }

          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: authRedirectUrl() },
          })
          if (error) {
            setMessage(error.message)
            setMessageTone('error')
          }
          else if (data.session && data.user) setUser(data.user)
          else {
            setMessage('Check your inbox to confirm your account. The link will bring you back to Hecate.')
            setMessageTone('success')
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
          if (error) {
            setMessage(error.message)
            setMessageTone('error')
          }
          else setUser(data.user)
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: authRedirectUrl(),
            shouldCreateUser: false,
          },
        })
        setMessage(error ? error.message : 'Check your inbox for a one-time sign-in link.')
        setMessageTone(error ? 'error' : 'success')
      }
    } catch {
      setMessage('Unable to reach your account right now. Check your connection and try again.')
      setMessageTone('error')
    } finally {
      setAuthPending(false)
    }
  }

  const signOut = async () => {
    if (!supabase) return
    setAuthPending(true)
    setMessage('')
    const { error } = await supabase.auth.signOut()
    if (error) {
      setMessage(error.message)
      setMessageTone('error')
    }
    else {
      setUser(null)
      setConfirmingDelete(false)
    }
    setAuthPending(false)
  }

  const deleteAccount = async () => {
    if (!supabase) return
    setAuthPending(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('delete_account')
      if (error) {
        setMessage(error.message)
        setMessageTone('error')
        return
      }

      await supabase.auth.signOut({ scope: 'local' })
      setUser(null)
      setConfirmingDelete(false)
      onClose()
    } catch {
      setMessage('Unable to delete your account right now. Check your connection and try again.')
      setMessageTone('error')
    } finally {
      setAuthPending(false)
    }
  }

  const accountName = user?.user_metadata?.full_name || user?.user_metadata?.name
  const accountEmail = user?.email ?? 'Signed-in account'
  const accountInitial = (accountName || accountEmail).trim().charAt(0).toUpperCase()
  const beginAccountCreation = () => {
    setSignInMethod('password')
    setPasswordIntent('signup')
    setPassword('')
    setConfirmPassword('')
    setMessage('')
  }

  return <div className="sheet-backdrop" onClick={onClose}>
    <section className="sheet" onClick={event => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="sync-title">
      <button className="icon-button sheet__close" onClick={onClose} aria-label="Close"><XIcon /></button>
      <div className="eyebrow">{user ? 'Account & sync' : 'Private by design'}</div>
      {!user && <div className="sync-privacy-subtitle"><span /> Location history is never sold or shared.</div>}
      <h2 id="sync-title">{user ? 'Your map is with you.' : 'Carry your map everywhere.'}</h2>
      <p>{user
        ? 'Your discoveries are connected to your private Hecate account and available across your signed-in devices.'
        : 'Sign in to start discovering. Your paths belong to your account and stay in sync across your devices.'}</p>
      {authLoading ? <div className="account-loading" role="status">Checking your account…</div>
        : user ? <div className="account-card">
          <div className="account-card__identity">
            <span className="account-card__avatar" aria-hidden="true">{accountInitial}</span>
            <span>
              {accountName && <strong>{accountName}</strong>}
              <small>{accountEmail}</small>
            </span>
          </div>
          <div className="account-card__status"><span /> Signed in and syncing</div>
          <button className="sign-out-button" type="button" onClick={signOut} disabled={authPending}>Sign out</button>
          {!confirmingDelete ? <button className="delete-account-button" type="button" onClick={() => { setConfirmingDelete(true); setMessage('') }} disabled={authPending}>Delete account</button>
            : <div className="delete-confirmation" role="alertdialog" aria-labelledby="delete-account-title" aria-describedby="delete-account-description">
              <strong id="delete-account-title">Delete your account?</strong>
              <p id="delete-account-description">All your discoveries, routes, and account data will be permanently deleted. This cannot be recovered.</p>
              <div className="delete-confirmation__actions">
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={authPending}>Cancel</button>
                <button className="delete-confirmation__confirm" type="button" onClick={deleteAccount} disabled={authPending}>{authPending ? 'Deleting…' : 'Delete permanently'}</button>
              </div>
            </div>}
          {message && <div className={`form-message form-message--${messageTone}`} role={messageTone === 'error' ? 'alert' : 'status'}>{message}</div>}
        </div>
        : isSyncConfigured ? <div className="auth-panel">
          <div className="auth-methods" role="tablist" aria-label="Sign-in method">
            <button type="button" role="tab" aria-selected={signInMethod === 'password'} className={signInMethod === 'password' ? 'active' : ''} onClick={() => { setSignInMethod('password'); setMessage('') }}>Password</button>
            <button type="button" role="tab" aria-selected={signInMethod === 'link'} className={signInMethod === 'link' ? 'active' : ''} onClick={() => { setSignInMethod('link'); setMessage('') }}>Email link</button>
          </div>
          <form className="auth-form" onSubmit={signIn}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
            {signInMethod === 'password' && <>
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={passwordIntent === 'signup' ? 'At least 8 characters' : 'Your password'} autoComplete={passwordIntent === 'signup' ? 'new-password' : 'current-password'} minLength={passwordIntent === 'signup' ? 8 : undefined} required />
              {passwordIntent === 'signup' && <>
                <label htmlFor="confirm-password">Confirm password</label>
                <input id="confirm-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Type your password again" autoComplete="new-password" minLength={8} required />
              </>}
            </>}
            <button className="auth-submit" type="submit" disabled={authPending}>{authPending
              ? passwordIntent === 'signup' && signInMethod === 'password' ? 'Creating account…' : signInMethod === 'password' ? 'Signing in…' : 'Sending…'
              : signInMethod === 'link' ? 'Send sign-in link' : passwordIntent === 'signup' ? 'Create account' : 'Sign in'}</button>
            {signInMethod === 'password' && <div className="auth-switch">
              <span>{passwordIntent === 'signin' ? 'New to Hecate?' : 'Already have an account?'}</span>
              <button type="button" onClick={() => {
                if (passwordIntent === 'signin') beginAccountCreation()
                else {
                  setPasswordIntent('signin')
                  setPassword('')
                  setConfirmPassword('')
                  setMessage('')
                }
              }}>{passwordIntent === 'signin' ? 'Create account' : 'Sign in'}</button>
            </div>}
            {signInMethod === 'link' && <div className="auth-switch">
              <span>New to Hecate?</span>
              <button type="button" onClick={beginAccountCreation}>Create account</button>
            </div>}
            {message && <div className={`form-message form-message--${messageTone}`} role={messageTone === 'error' ? 'alert' : 'status'}>{message}</div>}
          </form>
        </div> : <div className="setup-note">
        <span>Sync preview</span>
        Add Supabase keys from <code>.env.example</code> to enable private account sync.
      </div>}
      <nav className="account-legal-links" aria-label="Legal and support">
        <a href="/privacy-policy.html">Privacy Policy</a>
        <span aria-hidden="true">·</span>
        <a href="/support.html">Support</a>
      </nav>
    </section>
  </div>
}
