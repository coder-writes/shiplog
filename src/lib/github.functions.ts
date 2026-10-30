import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, diffDays, isIsoDate, todayInTz } from "./dates";

const isoDate = z.string().refine(isIsoDate, "Use a YYYY-MM-DD date");

/** save-github-connection: validates the token with GitHub, encrypts it, stores it with the service role. */
export const saveGithubConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        githubUsername: z.string().trim().min(1, "Enter your GitHub username").max(39),
        token: z.string().trim().min(10, "Paste a GitHub personal access token").max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { verifyToken, GitHubError } = await import("./github.server");
    const { encryptToken } = await import("./crypto.server");

    let login: string;
    try {
      login = await verifyToken(data.token);
    } catch (e) {
      if (e instanceof GitHubError) return { ok: false as const, error: e.message };
      return { ok: false as const, error: "Could not reach GitHub. Try again." };
    }
    if (login.toLowerCase() !== data.githubUsername.toLowerCase()) {
      return {
        ok: false as const,
        error: `This token belongs to "${login}", not "${data.githubUsername}".`,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("github_connections").upsert(
      {
        user_id: context.userId,
        github_username: login,
        token: await encryptToken(data.token),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("save connection failed:", error.message);
      return { ok: false as const, error: "Could not save the connection." };
    }
    return { ok: true as const, githubUsername: login };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("github_connections").delete().eq("user_id", context.userId);
    if (error) return { ok: false as const, error: "Could not disconnect." };
    return { ok: true as const };
  });

/** github-sync: default range is the last 7 days in the user's timezone. */
export const syncGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ start: isoDate.optional(), end: isoDate.optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("timezone")
      .eq("id", context.userId)
      .maybeSingle();
    const tz = profile?.timezone || "Asia/Kolkata";
    const end = data.end ?? todayInTz(tz);
    const start = data.start ?? addDays(end, -6);
    if (start > end) return { ok: false as const, error: "Start date must be before end date." };
    if (diffDays(end, start) > 92) return { ok: false as const, error: "Sync at most 3 months at a time." };

    const { syncGithubForUser, GitHubError } = await import("./github.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const counts = await syncGithubForUser(supabaseAdmin, context.userId, start, end);
      return { ok: true as const, counts, start, end };
    } catch (e) {
      if (e instanceof GitHubError) return { ok: false as const, error: e.message };
      console.error("sync failed:", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: e instanceof Error ? e.message : "Sync failed." };
    }
  });
