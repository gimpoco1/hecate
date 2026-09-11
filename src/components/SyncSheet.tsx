import { useState } from 'react'
import { isSyncConfigured, supabase } from '../storage'
import { XIcon } from './Icons'

type Props = { open: boolean; onClose: () => void }

export function SyncSheet({ open, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  if (!open) return null

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setMessage(error ? error.message : 'Check your inbox for a secure sign-in link.')
  }

  return <div className="sheet-backdrop" onClick={onClose}>
    <section className="sheet" onClick={event => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="sync-title">
      <button className="icon-button sheet__close" onClick={onClose} aria-label="Close"><XIcon /></button>
      <div className="eyebrow">Private by design</div>
      <h2 id="sync-title">Carry your map everywhere.</h2>
      <p>Your discovered paths are stored on this device first. Sign in to keep a private account copy available across your devices.</p>
      {isSyncConfigured ? <form onSubmit={signIn}>
        <label htmlFor="email">Email address</label>
        <div className="email-row">
          <input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required />
          <button type="submit">Send link</button>
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
