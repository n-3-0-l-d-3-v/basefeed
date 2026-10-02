import { env } from "./env";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResult = { sent: true; via: "resend" | "mailpit" } | { sent: false; reason: string };

/** Resend in production; Supabase's local Mailpit in development; otherwise skipped (never fails a job). */
export async function sendEmail(mail: Email): Promise<SendResult> {
  const e = env();
  if (e.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    // 4xx (bad address, unverified domain) won't succeed on retry; 5xx and 429 will.
    if (res.status === 429 || res.status >= 500) throw new Error(`email provider ${res.status}`);
    if (!res.ok) return { sent: false, reason: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { sent: true, via: "resend" };
  }
  if (e.MAILPIT_URL) {
    const [, name, address] = /^(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?$/.exec(e.EMAIL_FROM) ?? [];
    const res = await fetch(new URL("/api/v1/send", e.MAILPIT_URL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: { Email: address ?? "feedback@basenine.test", Name: name?.trim() || "Basenine Feedback" },
        To: [{ Email: mail.to }],
        Subject: mail.subject,
        HTML: mail.html,
        Text: mail.text,
      }),
    });
    if (!res.ok) throw new Error(`mailpit ${res.status}`);
    return { sent: true, via: "mailpit" };
  }
  return { sent: false, reason: "no email provider configured" };
}
