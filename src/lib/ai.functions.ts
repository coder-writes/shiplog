import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CATEGORIES } from "./constants";
import { isIsoDate } from "./dates";
import { groundItems } from "./grounding";

const isoDate = z.string().refine(isIsoDate, "Use a YYYY-MM-DD date");

const ENTRY_INSTRUCTIONS = `You turn a developer's spoken daily note and their GitHub activity into structured work items.

Rules:
- Write in first person past tense for done work, and plain future tense for planned work. Short, direct sentences. No filler, no marketing language, no em dashes.
- Every item must be grounded. It must reference at least one activity id from the list OR come directly from the spoken note (from_note true). Never invent work, numbers, tools or outcomes that are not in the note or the activity.
- Merge duplicates. If the note says "fixed the sync bug" and a PR is titled "fix: sync retry", output one item that links that PR and set from_note true.
- Group a burst of related commits on the same branch or PR into one item.
- Map activity to categories: merged PRs and feature commits to shipped, fix commits and bug issues to fixed, review activity to reviewed, comments that help teammates or answer questions to helped, anything the note says is next to planned. Use learned for things the note says were learned, in_progress for unfinished work.
- Put a number in impact_note only if it appears in the note or in the data (lines changed, PR count). Otherwise impact_note is null.
- source_activity_ids must only contain ids copied exactly from the activity list.
- Ignore blockers here; they are not items.`;

const itemsSchema = z.object({
  items: z.array(
    z.object({
      category: z.enum(CATEGORIES),
      text: z.string(),
      impact_note: z.string().nullable(),
      source_activity_ids: z.array(z.string()),
      from_note: z.boolean(),
    }),
  ),
});

/** generate-entry */
export const generateEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entry_date: isoDate }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [entryRes, actRes] = await Promise.all([
      supabase.from("daily_entries").select("id, raw_note").eq("entry_date", data.entry_date).maybeSingle(),
      supabase
        .from("github_activity")
        .select("id, type, repo, title, body_excerpt, state, additions, deletions, occurred_at")
        .eq("activity_date", data.entry_date)
        .order("occurred_at"),
    ]);
    if (entryRes.error || actRes.error) return { ok: false as const, error: "Could not load this day." };
    const note = entryRes.data?.raw_note?.trim() ?? "";
    const activity = actRes.data ?? [];
    if (!note && activity.length === 0) {
      return { ok: false as const, error: "Write a note or sync GitHub for this day first." };
    }

    const prompt = [
      `Date: ${data.entry_date}`,
      "",
      "Spoken note:",
      note || "(no note)",
      "",
      "GitHub activity (one JSON object per line):",
      activity.length
        ? activity
            .map((a) =>
              JSON.stringify({
                id: a.id,
                type: a.type,
                repo: a.repo,
                title: a.title,
                excerpt: a.body_excerpt,
                state: a.state,
                additions: a.additions,
                deletions: a.deletions,
              }),
            )
            .join("\n")
        : "(none)",
    ].join("\n");

    const { generateStructured, AiError } = await import("./ai.server");
    let raw: z.infer<typeof itemsSchema>;
    try {
      raw = await generateStructured({ instructions: ENTRY_INSTRUCTIONS, prompt, schema: itemsSchema });
    } catch (e) {
      return { ok: false as const, error: e instanceof AiError ? e.message : "The AI request failed." };
    }

    const clean = groundItems(raw.items ?? [], note, activity);
    const dropped = (raw.items?.length ?? 0) - clean.length;

    const { error: delErr } = await supabase
      .from("items")
      .delete()
      .eq("item_date", data.entry_date)
      .eq("status", "pending");
    if (delErr) return { ok: false as const, error: "Could not replace pending items." };

    if (clean.length) {
      const { error: insErr } = await supabase.from("items").insert(
        clean.map((i) => ({
          ...i,
          user_id: userId,
          entry_id: entryRes.data?.id ?? null,
          item_date: data.entry_date,
          status: "pending",
        })),
      );
      if (insErr) return { ok: false as const, error: "Could not save items." };
    }
    return { ok: true as const, created: clean.length, dropped };
  });

/** generate-report: built only from approved items and computed stats. */
export const generateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ type: z.enum(["standup", "weekly", "brag"]), start: isoDate, end: isoDate })
      .refine((v) => v.start <= v.end, "Start must be before end")
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { buildReport } = await import("./reports.server");
    let meetings = null;
    if (data.type === "standup") {
      // Meetings come from the user's own Google Calendar when connected; skipped otherwise.
      const { data: profile } = await context.supabase.from("profiles").select("timezone").eq("id", context.userId).maybeSingle();
      const { fetchMeetings } = await import("./calendar.server");
      try {
        const res = await fetchMeetings(context.userId, data.start, data.end, profile?.timezone || "Asia/Kolkata");
        if (res.status === "ok") meetings = res.meetings;
      } catch (e) {
        console.error("standup meetings:", e instanceof Error ? e.message : "unknown");
      }
    }
    return buildReport(context.supabase, context.userId, data, { meetings });
  });
