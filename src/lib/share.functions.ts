import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SHARE_DURATIONS, shareExpiry, signShareToken, verifyShareToken, type ShareDays } from "./share-token";

function signingKey(): string {
  const key = process.env["SHARE_LINK_SIGNING_KEY"];
  if (!key) throw new Error("Share links are not set up on the server.");
  return key;
}

/** Create a signed, expiring read-only link for one of your reports. */
export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reportId: z.string().uuid(),
        days: z.number().refine((d): d is ShareDays => (SHARE_DURATIONS as readonly number[]).includes(d)),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Ownership check runs as the user, so RLS decides.
    const { data: report } = await context.supabase.from("reports").select("id").eq("id", data.reportId).maybeSingle();
    if (!report) return { ok: false as const, error: "Report not found." };

    const expiresAt = shareExpiry(data.days as ShareDays);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share, error } = await supabaseAdmin
      .from("report_shares")
      .insert({ user_id: context.userId, report_id: report.id, expires_at: expiresAt.toISOString() })
      .select("id")
      .single();
    if (error || !share) return { ok: false as const, error: "Could not create the link." };
    const token = await signShareToken(signingKey(), share.id, expiresAt);
    return { ok: true as const, token, expiresAt: expiresAt.toISOString() };
  });

/** Public: read one shared report. The signed token is the only credential. */
export const getSharedReport = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const check = await verifyShareToken(signingKey(), data.token);
    if (!check.ok) return { ok: false as const, reason: check.reason };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: share } = await supabaseAdmin
      .from("report_shares")
      .select("report_id, user_id, expires_at, revoked_at")
      .eq("id", check.shareId)
      .maybeSingle();
    if (!share) return { ok: false as const, reason: "invalid" as const };
    if (share.revoked_at) return { ok: false as const, reason: "revoked" as const };
    if (new Date(share.expires_at).getTime() <= Date.now()) return { ok: false as const, reason: "expired" as const };

    const { data: report } = await supabaseAdmin
      .from("reports")
      .select("type, period_start, period_end, markdown")
      .eq("id", share.report_id)
      .eq("user_id", share.user_id)
      .maybeSingle();
    if (!report) return { ok: false as const, reason: "invalid" as const };
    return { ok: true as const, report, expiresAt: share.expires_at };
  });
