import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSyncConfigured, supabase } from '../storage'
import { XIcon } from './Icons'

type Props = { open: boolean; onClose: () => void }

export function SyncSheet({ open, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(isSyncConfigured)
  const [authPending, setAuthPending] = useState(false)

  useEffect(() => {
    if (!open) return
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setMessage(error ? error.message : 'Check your inbox for a secure sign-in link.')
    setAuthPending(false)
  }

  const signOut = async () => {
    if (!supabase) return
    setAuthPending(true)
    setMessage('')
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
    else setUser(null)
    setAuthPending(false)
  }

  const accountName = user?.user_metadata?.full_name || user?.user_metadata?.name
  const accountEmail = user?.email ?? 'Signed-in account'
  const accountInitial = (accountName || accountEmail).trim().charAt(0).toUpperCase()

  return <div className="sheet-backdrop" onClick={onClose}>
    <section className="sheet" onClick={event => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="sync-title">
      <button className="icon-button sheet__close" onClick={onClose} aria-label="Close"><XIcon /></button>
      <div className="eyebrow">{user ? 'Account & sync' : 'Private by design'}</div>
      <h2 id="sync-title">{user ? 'Your map is with you.' : 'Carry your map everywhere.'}</h2>
      <p>{user
        ? 'Your discoveries are connected to your private Hecate account and available across your signed-in devices.'
        : 'Your discovered paths are stored on this device first. Sign in to keep a private account copy available across your devices.'}</p>
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
          {message && <div className="form-message" role="status">{message}</div>}
        </div>
        : isSyncConfigured ? <form onSubmit={signIn}>
        <label htmlFor="email">Email address</label>
        <div className="email-row">
          <input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required />
          <button type="submit" disabled={authPending}>{authPending ? 'Sending…' : 'Send link'}</button>
        </div>
        {message && <div className="form-message" role="status">{message}</div>}
      </form> : <div className="setup-note">
        <span>Sync preview</span>
        Add Supabase keys from <code>.env.example</code> to enable passwordless account sync.
      </div>}
      <div className="privacy-row"><span className="privacy-dot" /> Location history is never sold or shared.</div>
    </section>
  </div>
}
