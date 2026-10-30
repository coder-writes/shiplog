import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Runs hourly. Each opted-in user gets last week's report once, on the first
// day of their week from 9 am in their own timezone.
async function runWeeklyEmails() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendWeeklyReportEmail } = await import("@/lib/weekly-email.server");
  const { weeklyEmailDue } = await import("@/lib/weekly-email");
  const { todayInTz, hourInTz } = await import("@/lib/dates");

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, timezone, week_starts_on, weekly_email_last_period")
    .eq("weekly_email_enabled", true);
  if (error) {
    console.error("weekly email: could not list profiles:", error.message);
    return { sent: 0, failed: 0 };
  }
  let sent = 0;
  let failed = 0;
  const now = new Date();
  for (const p of profiles ?? []) {
    const tz = p.timezone || "Asia/Kolkata";
    const period = weeklyEmailDue({
      today: todayInTz(tz, now),
      localHour: hourInTz(now, tz),
      weekStart: p.week_starts_on === "sunday" ? "sunday" : "monday",
      lastSentPeriod: p.weekly_email_last_period,
    });
    if (!period) continue;
    try {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.id);
      const email = u.user?.email;
      if (!email) continue;
      const res = await sendWeeklyReportEmail(supabaseAdmin, p.id, email, period);
      if (res.ok) sent++;
      else {
        failed++;
        console.error("weekly email skipped for a user:", res.error);
      }
    } catch (e) {
      failed++;
      console.error("weekly email failed for a user:", e instanceof Error ? e.message : "unknown");
    }
  }
  return { sent, failed };
}

export const Route = createFileRoute("/api/public/jobs/weekly-report-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const waitUntil = (request as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
        if (typeof waitUntil === "function") {
          waitUntil(runWeeklyEmails());
          return Response.json({ accepted: true }, { status: 202 });
        }
        const result = await runWeeklyEmails();
        return Response.json({ success: true, ...result });
      },
    },
  },
});
