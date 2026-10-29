import { t } from "./i18n";
import { supabase } from "./storage";

export const FEEDBACK_REASONS = [
  { value: "bugs", get label() { return t("Bugs & glitches"); } },
  { value: "battery", get label() { return t("Battery usage"); } },
  { value: "confusing", get label() { return t("Hard to use"); } },
  { value: "missing_features", get label() { return t("Missing features"); } },
  { value: "not_using", get label() { return t("Not using it"); } },
  { value: "other", get label() { return t("Something else"); } },
] as const;
export type FeedbackReason = typeof FEEDBACK_REASONS[number]["value"];
export type FeedbackSubmission = { id: string; reason: FeedbackReason; message: string; replyEmail: string };

/** The server attaches the authenticated user ID; the same submission ID is safe to retry. */
export async function submitFeedback(submission: FeedbackSubmission, expectedUserId: string): Promise<void> {
  if (!supabase) throw new Error(t("Feedback is unavailable in this build. Contact supporthecate@gmail.com."));
  if (!FEEDBACK_REASONS.some((reason) => reason.value === submission.reason) || submission.message.trim().length > 2000 || submission.replyEmail.trim().length > 254) {
    throw new TypeError(t("Choose a reason, keep your feedback within 2,000 characters, and check your email address."));
  }
  for (let attempt = 1; ; attempt += 1) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session || session.user.id !== expectedUserId) throw new Error(t("Sign in to the same account again before sending this feedback."));
    const { error, status } = await supabase.rpc("submit_app_feedback", {
      p_id: submission.id,
      p_reason: submission.reason,
      p_message: submission.message.trim(),
      p_reply_email: submission.replyEmail.trim(),
    }).abortSignal(AbortSignal.timeout(15_000));
    if (!error) return;
    if (status === 401 || status === 403) throw new Error(t("Sign in again before sending feedback."));
    if (status === 429) throw new Error(t("Feedback is limited to one submission per minute and five per day. Please wait before trying again."));
    if (attempt < 3 && (status === 0 || status === 408 || status >= 500)) {
      console.warn("Retrying feedback submission", { attempt, status, code: error.code });
      await new Promise<void>((resolve) => window.setTimeout(resolve, attempt * 500));
      continue;
    }
    console.error("Feedback submission failed", { status, code: error.code });
    throw new Error(status === 0
      ? t("Your feedback wasn’t sent. Check your connection and try again.")
      : t("Your feedback wasn’t sent (HTTP {{value0}}, {{value1}}). Please try again or contact supporthecate@gmail.com.", { value0: status, value1: error.code }));
  }
}
