import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Nightly sync (scheduled for 11:30 pm Asia/Kolkata). Covers the last 2 days
// in each user's own timezone for every user with a GitHub connection.
async function runNightlySync() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { syncGithubForUser } = await import("@/lib/github.server");
  const { addDays, todayInTz } = await import("@/lib/dates");

  const { data: conns, error } = await supabaseAdmin.from("github_connections").select("user_id");
  if (error) {
    console.error("nightly sync: could not list connections:", error.message);
    return { users: 0, failed: 0 };
  }
  let failed = 0;
  for (const c of conns ?? []) {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("timezone")
        .eq("id", c.user_id)
        .maybeSingle();
      const today = todayInTz(profile?.timezone || "Asia/Kolkata");
      await syncGithubForUser(supabaseAdmin, c.user_id, addDays(today, -1), today);
    } catch (e) {
      failed++;
      console.error("nightly sync failed for a user:", e instanceof Error ? e.message : "unknown");
    }
  }
  return { users: conns?.length ?? 0, failed };
}

export const Route = createFileRoute("/api/public/jobs/github-sync-nightly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        // Keep running after the scheduler's short HTTP timeout when the runtime allows it.
        const waitUntil = (request as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
        if (typeof waitUntil === "function") {
          waitUntil(runNightlySync());
          return Response.json({ accepted: true }, { status: 202 });
        }
        const result = await runNightlySync();
        return Response.json({ success: true, ...result });
      },
    },
  },
});
