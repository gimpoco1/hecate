import nodemailer from "nodemailer";
import { PayloadTooLargeError, readJson } from "../_shared/http.ts";

const SUPPORT_EMAIL = "supporthecate@gmail.com";
const REASONS = {
  bugs: "Something isn’t working",
  battery: "Battery usage",
  confusing: "It’s hard to use",
  missing_features: "A feature is missing",
  not_using: "I’m not using it enough",
  other: "Something else",
} as const;

type FeedbackRecord = {
  id: string;
  user_id: string | null;
  created_at: string;
  reason: keyof typeof REASONS;
  message: string | null;
  reply_email: string | null;
};
type FeedbackWebhook = { type: string; table: string; schema: string; record: FeedbackRecord };
type MailFailure = Error & { code?: string; responseCode?: number };

function parseFeedbackWebhook(value: unknown): FeedbackRecord {
  if (!value || typeof value !== "object") throw new TypeError("Expected a feedback INSERT webhook.");
  const payload = value as Partial<FeedbackWebhook>;
  const record = payload.record;
  if (payload.type !== "INSERT" || payload.table !== "app_feedback" || payload.schema !== "public" ||
      !record || typeof record !== "object" ||
      typeof record.id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(record.id) ||
      !(record.user_id === null || (typeof record.user_id === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(record.user_id))) ||
      typeof record.created_at !== "string" || !Number.isFinite(Date.parse(record.created_at)) ||
      typeof record.reason !== "string" || !Object.hasOwn(REASONS, record.reason) ||
      !(record.message === null || (typeof record.message === "string" && record.message.length <= 2000)) ||
      !(record.reply_email === null || (typeof record.reply_email === "string" && record.reply_email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.reply_email)))) {
    throw new TypeError("The webhook must contain a valid public.app_feedback INSERT record.");
  }
  return record;
}

/** Called only by the database webhook. Set FEEDBACK_WEBHOOK_SECRET and GMAIL_APP_PASSWORD in Supabase secrets. */
Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return Response.json({ error: "POST required." }, { status: 405 });
  const webhookSecret = Deno.env.get("FEEDBACK_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("Feedback email configuration missing", { secret: "FEEDBACK_WEBHOOK_SECRET" });
    return Response.json({ error: "Feedback webhook authentication is not configured." }, { status: 503 });
  }
  if (request.headers.get("x-feedback-secret") !== webhookSecret) {
    return Response.json({ error: "Invalid feedback webhook credentials." }, { status: 401 });
  }
  let record: FeedbackRecord;
  try {
    record = parseFeedbackWebhook(await readJson(request, 16_384));
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof SyntaxError) && !(error instanceof PayloadTooLargeError)) throw error;
    return Response.json({ error: error.message }, { status: error instanceof PayloadTooLargeError ? 413 : 400 });
  }
  const password = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s/g, "");
  if (!password) {
    console.error("Feedback email configuration missing", { secret: "GMAIL_APP_PASSWORD", feedbackId: record.id });
    return Response.json({ error: "Set GMAIL_APP_PASSWORD in Supabase Edge Function secrets." }, { status: 503 });
  }
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: SUPPORT_EMAIL, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const message = {
    from: { name: "Hecate feedback", address: SUPPORT_EMAIL },
    to: SUPPORT_EMAIL,
    replyTo: record.reply_email ?? undefined,
    subject: `New Hecate feedback: ${REASONS[record.reason]}`,
    text: [
      "New feedback was saved in Hecate.",
      `Reason: ${REASONS[record.reason]}`,
      `Received: ${record.created_at}`,
      record.user_id ? `User ID: ${record.user_id}` : "User ID: Not recorded for this older submission.",
      "",
      record.message ?? "No additional comments.",
      "",
      record.reply_email ? `Reply email: ${record.reply_email}` : "No reply email provided.",
      `Feedback ID: ${record.id}`,
    ].join("\n"),
  };
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await transport.sendMail(message);
        if (!result.accepted.includes(SUPPORT_EMAIL)) throw new Error("Gmail did not accept the support recipient.");
        return Response.json({ sent: true, feedbackId: record.id });
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        const failure: MailFailure = error;
        const transient = ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS"].includes(failure.code ?? "") ||
          (failure.responseCode !== undefined && failure.responseCode >= 400 && failure.responseCode < 500);
        if (!transient || attempt === 3) throw failure;
        console.warn("Retrying feedback email", { feedbackId: record.id, attempt, code: failure.code, responseCode: failure.responseCode });
        await new Promise<void>((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const failure: MailFailure = error;
    console.error("Feedback email delivery failed", { feedbackId: record.id, code: failure.code, responseCode: failure.responseCode });
    return Response.json({ error: "Gmail could not deliver the feedback alert. Check the function logs; the feedback remains saved.", feedbackId: record.id }, { status: 502 });
  } finally {
    transport.close();
  }
});
