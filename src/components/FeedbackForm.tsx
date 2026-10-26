import { useEffect, useRef, useState, type FormEvent } from "react";
import { FEEDBACK_REASONS, submitFeedback, type FeedbackReason } from "../feedback";
import { XIcon } from "./Icons";
import { mdiBatteryOutline, mdiBugOutline, mdiCheck, mdiCheckCircleOutline, mdiClockOutline, mdiDotsHorizontal, mdiEmailOutline, mdiHelpCircleOutline, mdiLockOutline, mdiMessageTextOutline, mdiPuzzleOutline, mdiSendOutline } from "@mdi/js";

type Props = { onClose: () => void; keyboardInset: number; userId: string; accountEmail: string };
const reasonIcons: Record<FeedbackReason, string> = {
  bugs: mdiBugOutline,
  battery: mdiBatteryOutline,
  confusing: mdiHelpCircleOutline,
  missing_features: mdiPuzzleOutline,
  not_using: mdiClockOutline,
  other: mdiDotsHorizontal,
};

function FeedbackIcon({ path, size }: { path: string; size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={path} /></svg>;
}

export function FeedbackForm({ onClose, keyboardInset, userId, accountEmail }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submissionId = useRef(crypto.randomUUID());
  const submittingRef = useRef(false);
  const [reason, setReason] = useState<FeedbackReason | "">("");
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState(accountEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!reason || submittingRef.current) return;
    submittingRef.current = true;
    setSending(true);
    setError("");
    try {
      await submitFeedback({ id: submissionId.current, reason, message, replyEmail }, userId);
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your feedback wasn’t sent. Please try again.");
    } finally {
      submittingRef.current = false;
      setSending(false);
    }
  };

  return <dialog ref={dialogRef} className="feedback-dialog" data-testid="feedback-dialog" aria-labelledby="feedback-title"
    style={{ bottom: keyboardInset, maxHeight: `calc(100dvh - ${keyboardInset}px - env(safe-area-inset-top) - 16px)` }}
    onCancel={(event) => { event.preventDefault(); if (!sending) onClose(); }}>
    <header className="feedback-header">
      <span className="feedback-header__icon"><FeedbackIcon path={mdiMessageTextOutline} size={22} /></span>
      <h2 id="feedback-title">{sent ? "Thanks for telling us" : "Share feedback"}</h2>
      <button type="button" className="icon-button" aria-label="Close feedback" data-testid="feedback-close" disabled={sending} onClick={onClose}><XIcon /></button>
    </header>
    {sent ? <div className="feedback-success" role="status">
      <FeedbackIcon path={mdiCheckCircleOutline} size={44} />
      <p>Your feedback has been sent. It helps us make Hecate better.</p>
      <button type="button" className="primary-button" data-testid="feedback-done" onClick={onClose}>Done</button>
    </div> : <form onSubmit={(event) => { void submit(event); }}>
      <p className="feedback-intro">Help shape Hecate · about 2 min.</p>
      <fieldset disabled={sending}>
        <legend>What could be better?</legend>
        <div className="feedback-reasons">{FEEDBACK_REASONS.map((item) => <label key={item.value}>
          <input type="radio" name="feedback-reason" value={item.value} required checked={reason === item.value} onChange={() => setReason(item.value)} data-testid={`feedback-reason-${item.value}`} />
          <FeedbackIcon path={reasonIcons[item.value]} size={22} />
          <span>{item.label}</span>
          <span className="feedback-choice-check"><FeedbackIcon path={mdiCheck} size={12} /></span>
        </label>)}</div>
        <label className="feedback-field" htmlFor="feedback-message">
          <span className="feedback-field__label"><FeedbackIcon path={mdiMessageTextOutline} size={17} />Tell us more <small>Optional</small></span>
          <textarea id="feedback-message" data-testid="feedback-message" rows={2} maxLength={2000} placeholder="What happened, or what would help?" value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <label className="feedback-field" htmlFor="feedback-email">
          <span className="feedback-field__label"><FeedbackIcon path={mdiEmailOutline} size={17} />Email for a reply <small>Optional</small></span>
          <input id="feedback-email" data-testid="feedback-email" type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={replyEmail} onChange={(event) => setReplyEmail(event.target.value)} />
          <span className="feedback-field__hint">So we can follow up. You can change or remove it.</span>
        </label>
      </fieldset>
      <p className="feedback-privacy"><FeedbackIcon path={mdiLockOutline} size={15} />Linked to your account, private to our team. No location or journey data.</p>
      {error && <p role="alert" className="feedback-error">{error}</p>}
      <button type="submit" className="primary-button" data-testid="feedback-submit" disabled={sending || !reason}><FeedbackIcon path={mdiSendOutline} size={18} />{sending ? "Sending…" : "Send feedback"}</button>
    </form>}
  </dialog>;
}
