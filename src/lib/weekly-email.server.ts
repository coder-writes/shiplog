// Server-only: build last week's report for one user and email it to them.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildReport } from "./reports.server";
import { sendGmail, GmailError } from "./gmail.server";
import { markdownToEmailHtml, weeklyEmailSubject } from "./weekly-email";

export type WeeklySendResult = { ok: true } | { ok: false; error: string };

export async function sendWeeklyReportEmail(
  supabase: SupabaseClient<Database>,
  userId: string,
  to: string,
  period: { start: string; end: string },
): Promise<WeeklySendResult> {
  const report = await buildReport(supabase, userId, { type: "weekly", ...period });
  if (!report.ok) return report;
  try {
    await sendGmail({
      to,
      subject: weeklyEmailSubject(period.start, period.end),
      text: report.markdown,
      html: markdownToEmailHtml(report.markdown),
    });
  } catch (e) {
    return { ok: false, error: e instanceof GmailError ? e.message : "Could not send the email." };
  }
  await supabase.from("profiles").update({ weekly_email_last_period: period.start }).eq("id", userId);
  return { ok: true };
}
