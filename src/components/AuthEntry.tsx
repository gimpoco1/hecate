import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftIcon, ChevronIcon } from './Icons'
import { SocialSignIn } from './SocialSignIn'

type Props = {
  disabled: boolean
  onPendingChange: (pending: boolean) => void
  children: ReactNode
}

/** Keep provider selection and email authentication in separate, reversible steps. */
export function AuthEntry({ disabled, onPendingChange, children }: Props) {
  const [emailOpen, setEmailOpen] = useState(false)
  const emailButton = useRef<HTMLButtonElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const previousEmailOpen = useRef(false)

  useLayoutEffect(() => {
    if (previousEmailOpen.current === emailOpen) return
    previousEmailOpen.current = emailOpen
    const target = emailOpen ? backButton.current : emailButton.current
    target?.focus({ preventScroll: true })
  }, [emailOpen])

  return (
    <div className="auth-entry">
      {emailOpen ? (
        <>
          <button ref={backButton} type="button" className="auth-entry__back" data-testid="auth-options-back"
            disabled={disabled} onClick={() => setEmailOpen(false)}>
            <ArrowLeftIcon size={17} />
            All sign-in options
          </button>
          <div className="auth-entry__email" data-testid="auth-email-form">{children}</div>
        </>
      ) : (
        <>
          <SocialSignIn disabled={disabled} onPendingChange={onPendingChange} />
          <div className="auth-entry__divider" aria-hidden="true"><span>or</span></div>
          <button ref={emailButton} type="button" className="auth-entry__email-button" data-testid="auth-email-options"
            disabled={disabled} onClick={() => setEmailOpen(true)}>
            <span>Continue with email</span>
            <ChevronIcon size={17} />
          </button>
        </>
      )}
    </div>
  )
}
