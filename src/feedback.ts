import { supabase } from "./storage";

export const FEEDBACK_REASONS = [
  { value: "bugs", label: "Bugs & glitches" },
  { value: "battery", label: "Battery usage" },
  { value: "confusing", label: "Hard to use" },
  { value: "missing_features", label: "Missing features" },
  { value: "not_using", label: "Not using it" },
  { value: "other", label: "Something else" },
] as const;
export type FeedbackReason = typeof FEEDBACK_REASONS[number]["value"];
export type FeedbackSubmission = { id: string; reason: FeedbackReason; message: string; replyEmail: string };

/** The server attaches the authenticated user ID; the same submission ID is safe to retry. */
export async function submitFeedback(submission: FeedbackSubmission, expectedUserId: string): Promise<void> {
  if (!supabase) throw new Error("Feedback is unavailable in this build. Contact supporthecate@gmail.com.");
  if (!FEEDBACK_REASONS.some((reason) => reason.value === submission.reason) || submission.message.trim().length > 2000 || submission.replyEmail.trim().length > 254) {
    throw new TypeError("Choose a reason, keep your feedback within 2,000 characters, and check your email address.");
  }
  for (let attempt = 1; ; attempt += 1) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session || session.user.id !== expectedUserId) throw new Error("Sign in to the same account again before sending this feedback.");
    const { error, status } = await supabase.rpc("submit_app_feedback", {
      p_id: submission.id,
      p_reason: submission.reason,
      p_message: submission.message.trim(),
      p_reply_email: submission.replyEmail.trim(),
    }).abortSignal(AbortSignal.timeout(15_000));
    if (!error) return;
    if (status === 401 || status === 403) throw new Error("Sign in again before sending feedback.");
    if (status === 429) throw new Error("Feedback is limited to one submission per minute and five per day. Please wait before trying again.");
    if (attempt < 3 && (status === 0 || status === 408 || status >= 500)) {
      console.warn("Retrying feedback submission", { attempt, status, code: error.code });
      await new Promise<void>((resolve) => window.setTimeout(resolve, attempt * 500));
      continue;
    }
    console.error("Feedback submission failed", { status, code: error.code });
    throw new Error(status === 0
      ? "Your feedback wasn’t sent. Check your connection and try again."
      : `Your feedback wasn’t sent (HTTP ${status}, ${error.code}). Please try again or contact supporthecate@gmail.com.`);
  }
}
