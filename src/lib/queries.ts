// Browser data access. Every query runs as the signed-in user, so RLS scopes it.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Entry = Database["public"]["Tables"]["daily_entries"]["Row"];
export type Activity = Database["public"]["Tables"]["github_activity"]["Row"];
export type Item = Database["public"]["Tables"]["items"]["Row"];
export type Report = Database["public"]["Tables"]["reports"]["Row"];

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const profileQuery = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: async (): Promise<Profile> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const row = check(await supabase.from("profiles").select("*").eq("id", uid).maybeSingle());
      if (row) return row;
      // Fallback for accounts created before the signup trigger existed.
      const created = check(await supabase.from("profiles").insert({ id: uid }).select("*").single());
      if (!created) throw new Error("Could not create your profile.");
      return created;
    },
    staleTime: 60_000,
  });

export const entryQuery = (date: string) =>
  queryOptions({
    queryKey: ["entry", date],
    queryFn: async () =>
      check(await supabase.from("daily_entries").select("*").eq("entry_date", date).maybeSingle()),
  });

export const entriesListQuery = () =>
  queryOptions({
    queryKey: ["entries"],
    queryFn: async () =>
      check(
        await supabase
          .from("daily_entries")
          .select("id, entry_date, raw_note, updated_at")
          .order("entry_date", { ascending: false })
          .limit(200),
      ),
  });

export const activityQuery = (date: string) =>
  queryOptions({
    queryKey: ["activity", date],
    queryFn: async () =>
      check(
        await supabase
          .from("github_activity")
          .select("*")
          .eq("activity_date", date)
          .order("occurred_at", { ascending: true }),
      ),
  });

export const activityRangeQuery = (start: string, end: string) =>
  queryOptions({
    queryKey: ["activity-range", start, end],
    queryFn: async () =>
      check(
        await supabase
          .from("github_activity")
          .select("type, repo, additions, deletions")
          .gte("activity_date", start)
          .lte("activity_date", end)
          .limit(5000),
      ),
  });

export const loggedDatesQuery = () =>
  queryOptions({
    queryKey: ["logged-dates"],
    queryFn: async () => {
      const rows = check(
        await supabase
          .from("daily_entries")
          .select("entry_date, raw_note")
          .order("entry_date", { ascending: false })
          .limit(400),
      );
      return (rows ?? []).filter((r) => r.raw_note.trim()).map((r) => r.entry_date);
    },
  });

export const itemsQuery = (date: string) =>
  queryOptions({
    queryKey: ["items", date],
    queryFn: async () =>
      check(
        await supabase
          .from("items")
          .select("*")
          .eq("item_date", date)
          .order("created_at", { ascending: true }),
      ),
  });

export const reportsQuery = () =>
  queryOptions({
    queryKey: ["reports"],
    queryFn: async () =>
      check(
        await supabase
          .from("reports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ),
  });

export const connectionStatusQuery = () =>
  queryOptions({
    queryKey: ["connection-status"],
    queryFn: async () => {
      const rows = check(await supabase.rpc("connection_status"));
      const row = rows?.[0];
      return {
        connected: !!row?.connected,
        githubUsername: row?.github_username ?? null,
        lastSyncedAt: row?.last_synced_at ?? null,
      };
    },
  });

export const insightsActivityQuery = (start: string, end: string) =>
  queryOptions({
    queryKey: ["insights-activity", start, end],
    queryFn: async () =>
      check(
        await supabase
          .from("github_activity")
          .select("activity_date, type, repo")
          .gte("activity_date", start)
          .lte("activity_date", end)
          .limit(10000),
      ),
  });

export const approvedItemsRangeQuery = (start: string, end: string) =>
  queryOptions({
    queryKey: ["approved-items-range", start, end],
    queryFn: async () =>
      check(
        await supabase
          .from("items")
          .select("item_date, category")
          .eq("status", "approved")
          .gte("item_date", start)
          .lte("item_date", end)
          .limit(5000),
      ),
  });

export const reportSharesQuery = (reportId: string) =>
  queryOptions({
    queryKey: ["report-shares", reportId],
    queryFn: async () =>
      check(
        await supabase
          .from("report_shares")
          .select("id, expires_at, revoked_at, created_at")
          .eq("report_id", reportId)
          .order("created_at", { ascending: false }),
      ),
  });
