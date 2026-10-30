import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayInTz, startOfWeek, type WeekStart } from "./dates";
import { lastCompletedWeek } from "./weekly-email";

/** Email last week's report to the signed-in user right now (or current week if last week is empty). */
export const sendWeeklyReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const email = typeof claims.email === "string" ? claims.email : "";
    if (!email) return { ok: false as const, error: "Your account has no email address." };
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone, week_starts_on")
      .eq("id", userId)
      .maybeSingle();
    const tz = profile?.timezone || "Asia/Kolkata";
    const today = todayInTz(tz);
    const weekStart = (profile?.week_starts_on as WeekStart) || "monday";
    let period = lastCompletedWeek(today, weekStart);

    // Check if lastCompletedWeek has approved items
    const { count: lastWeekCount } = await supabase
      .from("items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "approved")
      .gte("item_date", period.start)
      .lte("item_date", period.end);

    // If last completed week is empty, check this current week so the user can test/send their current approved items!
    if (!lastWeekCount) {
      const currentWeekStart = startOfWeek(today, weekStart);
      const { count: currentWeekCount } = await supabase
        .from("items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "approved")
        .gte("item_date", currentWeekStart)
        .lte("item_date", today);

      if (currentWeekCount) {
        period = { start: currentWeekStart, end: today };
      }
    }

    const { sendWeeklyReportEmail } = await import("./weekly-email.server");
    const res = await sendWeeklyReportEmail(supabase, userId, email, period);
    return res.ok ? { ok: true as const, email, ...period } : res;
  });
