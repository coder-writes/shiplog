import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, dateInTz, todayInTz } from "./dates";

type DemoAct = {
  key: string;
  type: string;
  repo: string;
  title: string;
  body?: string;
  state?: string;
  add?: number;
  del?: number;
  hour: number; // UTC hour on that day
};

const DAYS: { offset: number; note: string; acts: DemoAct[]; items?: { category: string; text: string; impact?: string; keys: string[]; fromNote: boolean }[] }[] = [
  {
    offset: -3,
    note: "Worked on the sync retry logic. The nightly sync was failing silently when GitHub rate limited us. Added backoff and a clear error. Reviewed Priya's onboarding PR. Tomorrow I will start on the export feature.",
    acts: [
      { key: "c1", type: "commit", repo: "acme/shiplog-api", title: "fix: retry GitHub requests on secondary rate limit", hour: 5 },
      { key: "c2", type: "commit", repo: "acme/shiplog-api", title: "fix: surface rate limit error to the client", hour: 6 },
      { key: "p1", type: "pr_merged", repo: "acme/shiplog-api", title: "fix: sync retry with backoff", state: "merged", add: 142, del: 37, hour: 9 },
      { key: "r1", type: "review", repo: "acme/web", title: "Onboarding checklist for new workspaces", state: "approved", body: "Looks good. One note on the empty state copy.", hour: 10 },
    ],
    items: [
      { category: "fixed", text: "I fixed the nightly sync failing silently on GitHub rate limits by adding backoff and a clear error.", impact: "+142 / -37 lines", keys: ["c1", "c2", "p1"], fromNote: true },
      { category: "reviewed", text: "I reviewed Priya's onboarding checklist PR and approved it.", keys: ["r1"], fromNote: true },
    ],
  },
  {
    offset: -2,
    note: "Built the first version of CSV export for reports. Answered a question from Sam about how timezones are handled in the activity grouping. Learned that the search API caps at 1000 results.",
    acts: [
      { key: "c3", type: "commit", repo: "acme/web", title: "feat: export report as CSV", hour: 5 },
      { key: "p2", type: "pr_opened", repo: "acme/web", title: "feat: CSV export for reports", state: "open", hour: 7 },
      { key: "ic1", type: "issue_comment", repo: "acme/shiplog-api", title: "Activity shows on the wrong day", body: "We group by the profile timezone, so a commit at 1am IST lands on that IST day. Set your timezone in Settings.", state: "open", hour: 8 },
    ],
    items: [
      { category: "in_progress", text: "I built the first version of CSV export for reports.", keys: ["c3", "p2"], fromNote: true },
      { category: "helped", text: "I explained to Sam how activity is grouped by the profile timezone.", keys: ["ic1"], fromNote: true },
      { category: "learned", text: "I learned that the GitHub search API caps results at 1000.", keys: [], fromNote: true },
    ],
  },
  {
    offset: -1,
    note: "Finished CSV export and got it merged. Opened an issue for the flaky date picker test. Waiting on design for the brag doc layout, that is blocking the next step. Next I will write tests for the export.",
    acts: [
      { key: "c4", type: "commit", repo: "acme/web", title: "feat: include stats in CSV export", hour: 4 },
      { key: "p3", type: "pr_merged", repo: "acme/web", title: "feat: CSV export for reports", state: "merged", add: 318, del: 54, hour: 9 },
      { key: "i1", type: "issue_opened", repo: "acme/web", title: "Date picker test is flaky on CI", state: "open", hour: 10 },
      { key: "pc1", type: "pr_comment", repo: "acme/web", title: "Dark mode tokens", body: "Can we reuse the muted token here instead of a new grey?", state: "open", hour: 11 },
    ],
  },
];

/** Load demo data for the signed-in user (RLS scoped). Safe to run twice. */
export const loadDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
    const tz = profile?.timezone || "Asia/Kolkata";
    const today = todayInTz(tz);

    for (const day of DAYS) {
      const date = addDays(today, day.offset);
      const { data: entry } = await supabase
        .from("daily_entries")
        .upsert({ user_id: userId, entry_date: date, raw_note: day.note }, { onConflict: "user_id,entry_date", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();

      const rows = day.acts.map((a) => {
        const occurred = `${date}T${String(a.hour).padStart(2, "0")}:15:00Z`;
        return {
          user_id: userId,
          external_id: `demo:${a.key}`,
          type: a.type,
          repo: a.repo,
          title: a.title,
          body_excerpt: a.body ?? null,
          url: `https://github.com/${a.repo}`,
          sha: a.type === "commit" ? `demo${a.key}` : null,
          state: a.state ?? null,
          occurred_at: occurred,
          activity_date: dateInTz(occurred, tz),
          additions: a.add ?? null,
          deletions: a.del ?? null,
        };
      });
      const { data: saved, error } = await supabase
        .from("github_activity")
        .upsert(rows, { onConflict: "user_id,external_id" })
        .select("id, external_id");
      if (error) return { ok: false as const, error: "Could not load demo activity." };

      if (day.items) {
        const { count } = await supabase
          .from("items")
          .select("id", { count: "exact", head: true })
          .eq("item_date", date);
        if (!count) {
          const idFor = new Map((saved ?? []).map((s) => [s.external_id, s.id]));
          let entryId = entry?.id ?? null;
          if (!entryId) {
            const { data: e } = await supabase.from("daily_entries").select("id").eq("entry_date", date).maybeSingle();
            entryId = e?.id ?? null;
          }
          await supabase.from("items").insert(
            day.items.map((i) => ({
              user_id: userId,
              entry_id: entryId,
              item_date: date,
              category: i.category,
              text: i.text,
              impact_note: i.impact ?? null,
              source_activity_ids: i.keys.map((k) => idFor.get(`demo:${k}`)).filter((x): x is string => !!x),
              from_note: i.fromNote,
              status: "approved",
            })),
          );
        }
      }
    }
    return { ok: true as const };
  });

/** Remove demo GitHub activity. Notes and items are kept so nothing you wrote is lost. */
export const clearDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("github_activity").delete().like("external_id", "demo:%");
    if (error) return { ok: false as const, error: "Could not remove demo data." };
    return { ok: true as const };
  });
