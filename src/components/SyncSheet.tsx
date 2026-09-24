import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { User } from '@supabase/supabase-js'
import { authRedirectUrl } from '../auth'
import { clearReminderPreference } from '../explorationReminder'
import { INACTIVITY_RADIUS_M, INACTIVITY_REMINDER_MINUTES } from '../inactivityReminder'
import { openLocationSettings } from '../location'
import { isSyncConfigured, supabase } from '../storage'
import { CITY_MILESTONE_TIERS } from '../badges'
import { AchievementArtwork } from './AchievementArtwork'
import { CityLevelStars } from './CityLevelStars'
import { ChevronIcon, InfoIcon, XIcon } from './Icons'

type Props = {
  open: boolean
  onClose: () => void
  reminderEnabled: boolean
  nativeApp: boolean
  cityProgress: {
    cityId: string
    cityName: string
    discoveredKm: number
  } | null
  onReminderChange: (enabled: boolean) => Promise<string | null>
}
type SignInMethod = 'password' | 'link'
type PasswordIntent = 'signin' | 'signup'
type MessageTone = 'success' | 'error'

export function SyncSheet({ open, onClose, reminderEnabled, nativeApp, cityProgress, onReminderChange }: Props) {
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
  const [reminderPending, setReminderPending] = useState(false)
  const [reminderError, setReminderError] = useState('')
  const [cityMilestoneInfoOpen, setCityMilestoneInfoOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setConfirmingDelete(false)
      setCityMilestoneInfoOpen(false)
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
            setPasswordIntent('signin')
            setPassword('')
            setConfirmPassword('')
            setMessage('Check your inbox to confirm your account. If you cannot see the email, check your spam folder. The link will bring you back to Hecate.')
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

      if (user) clearReminderPreference(user.id)
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
  const cityMilestoneCount = cityProgress
    ? CITY_MILESTONE_TIERS.filter(tier => cityProgress.discoveredKm >= tier.thresholdKm).length
    : 0
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
      {!user && <div className="sync-privacy-subtitle"><span /> Your recorded discoveries stay private to your account.</div>}
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
          <div className="account-setting">
            <div>
              <strong>Discovery reminders</strong>
              <p>{nativeApp
                ? 'Get a reminder after five minutes moving through new areas. Opening it pauses reminders for 30 minutes. Reminder locations are not saved or synced.'
                : 'Check for five minutes in unmapped areas while this page is open. Browsers cannot reliably monitor walks in the background.'}</p>
            </div>
            <button type="button" role="switch" aria-checked={reminderEnabled} aria-label="Discovery reminders" disabled={reminderPending} onClick={() => {
              setReminderPending(true)
              setReminderError('')
              void onReminderChange(!reminderEnabled).then(error => setReminderError(error ?? '')).finally(() => setReminderPending(false))
            }}>{reminderEnabled ? 'On' : 'Off'}</button>
          </div>
          {Capacitor.getPlatform() === 'ios' && <details className="tracking-help">
            <summary>How tracking works <ChevronIcon size={18} strokeWidth={2.4} /></summary>
            <div className="tracking-help__content">
              <p><strong>While Using:</strong> Hecate can check for new areas in the background, but iPhone may show a blue clock for Hecate.</p>
              <p><strong>Always:</strong> Hecate can send background reminders without showing the blue clock. Recording a walk may still show it.</p>
              <p><strong>Never:</strong> Location features and discovery reminders cannot work.</p>
              <p>Only walks you start recording are saved to your map. Reminder locations are not saved.</p>
              <p>While recording, Hecate can suggest stopping after {INACTIVITY_REMINDER_MINUTES} minutes within {INACTIVITY_RADIUS_M} m of one spot already on your map. Areas revealed during the current recording count too. The reminder is a suggestion; recording never stops automatically.</p>
              <figure className="tracking-help__example">
                <img src="/blue-location-clock.svg" alt="Example of the blue clock on an iPhone" width="122" height="42" />
                <figcaption>A blue clock means an app is using location in the background. It may be Hecate or another app.</figcaption>
              </figure>
              <button type="button" onClick={() => void openLocationSettings().catch(() => undefined)}>Open iPhone Settings</button>
              <small>Then tap Location → Always.</small>
            </div>
          </details>}
          {reminderError && <div className="form-message form-message--error" role="alert">{reminderError}</div>}
          {cityProgress && <section className="account-milestones" aria-labelledby="account-milestones-title">
            <div className="account-milestones__heading">
              <span>
                <span className="account-milestones__title-row">
                  <strong id="account-milestones-title">City milestones</strong>
                  <button
                    type="button"
                    className="account-milestones__info-button"
                    aria-label="Why these city milestones are shown"
                    aria-expanded={cityMilestoneInfoOpen}
                    aria-controls="account-milestones-explanation"
                    onClick={() => setCityMilestoneInfoOpen(current => !current)}
                  >
                    <InfoIcon size={15} strokeWidth={1.9} />
                  </button>
                </span>
                <small>Your progress in {cityProgress.cityName}</small>
              </span>
              <small>{cityMilestoneCount} / {CITY_MILESTONE_TIERS.length} earned</small>
            </div>
            {cityMilestoneInfoOpen && <p
              className="account-milestones__explanation"
              id="account-milestones-explanation"
              role="note"
            >
              This is the city you are currently in. Hecate shows one city’s milestones at a time and updates this section when your current city changes.
            </p>}
            <div className="account-milestones__list">
              {CITY_MILESTONE_TIERS.map(milestone => {
                  const earned = cityProgress.discoveredKm >= milestone.thresholdKm
                  const remainingKm = Math.max(0, milestone.thresholdKm - cityProgress.discoveredKm)
                  return <article
                    className={`account-milestone${earned ? '' : ' account-milestone--locked'}`}
                    key={milestone.id}
                    aria-label={earned
                      ? `${milestone.title} earned in ${cityProgress.cityName}`
                      : `${milestone.title} requires ${milestone.thresholdKm} kilometers in ${cityProgress.cityName}. ${remainingKm.toFixed(1)} kilometers remaining.`}
                  >
                    <AchievementArtwork image={milestone.image} title={milestone.title} size={48} />
                    <strong>{milestone.title}</strong>
                    {earned
                      ? <span className="account-milestone__goal">Earned at {milestone.thresholdKm} km</span>
                      : <span className="account-milestone__goal">
                        <strong>{cityProgress.discoveredKm.toFixed(1)} / {milestone.thresholdKm} km</strong>
                        <small>{remainingKm.toFixed(1)} km left</small>
                      </span>}
                    <CityLevelStars level={milestone.level} decorative />
                  </article>
              })}
            </div>
          </section>}
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
