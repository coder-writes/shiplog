// Server-only report builder shared by the Reports page and the weekly email.
// Every query filters by user_id so it is safe with the admin client too.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { CATEGORY_LABELS, stripDashes, type Category } from "./constants";
import { addDays, formatLongDate, formatMonth, todayInTz } from "./dates";
import { computeStats, statsToMarkdown } from "./stats";
import { meetingsToMarkdown, type Meeting } from "./meetings";

export type ReportInput = { type: "standup" | "weekly" | "brag"; start: string; end: string };
export type ReportResult = { ok: true; id: string; markdown: string } | { ok: false; error: string };

const blockersSchema = z.object({ blockers: z.array(z.string()) });
const summarySchema = z.object({ summary: z.string() });

type ItemRow = {
  item_date: string;
  category: string;
  text: string;
  impact_note: string | null;
};

const bullet = (i: ItemRow) => `- ${i.text}${i.impact_note ? ` (${i.impact_note})` : ""}`;
const list = (rows: ItemRow[], empty = "- None") => (rows.length ? rows.map(bullet).join("\n") : empty);

export async function buildReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: ReportInput,
  extras: { meetings?: Meeting[] | null } = {},
): Promise<ReportResult> {
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
    const tz = profile?.timezone || "Asia/Kolkata";
    const today = todayInTz(tz);

    const [itemsRes, actRes, loggedRes] = await Promise.all([
      supabase
        .from("items")
        .select("item_date, category, text, impact_note")
        .eq("user_id", userId)
        .eq("status", "approved")
        .gte("item_date", data.start)
        .lte("item_date", data.end)
        .order("item_date", { ascending: false })
        .order("created_at"),
      supabase
        .from("github_activity")
        .select("type, repo, additions, deletions")
        .eq("user_id", userId)
        .gte("activity_date", data.start)
        .lte("activity_date", data.end)
        .limit(5000),
      supabase.from("daily_entries").select("entry_date, raw_note")
        .eq("user_id", userId).lte("entry_date", data.end).order("entry_date", { ascending: false }).limit(400),
    ]);
    if (itemsRes.error || actRes.error || loggedRes.error) {
      return { ok: false as const, error: "Could not load your items." };
    }
    const items = itemsRes.data ?? [];
    const logged = (loggedRes.data ?? []).filter((e) => e.raw_note.trim()).map((e) => e.entry_date);
    const stats = computeStats(actRes.data ?? [], logged, data.end);
    const by = (cats: Category[]) => items.filter((i) => cats.includes(i.category as Category));

    const { generateStructured, AiError } = await import("./ai.server");
    const aiFail = (e: unknown) => ({
      ok: false as const,
      error: e instanceof AiError ? e.message : "The AI request failed.",
    });

    let markdown = "";
    // For open-ended ranges (brag "All time"), start at the first approved item.
    const earliest = items[items.length - 1]?.item_date;
    const effectiveStart = data.type === "brag" && earliest && earliest > data.start ? earliest : data.start;

    if (data.type === "standup") {
      const done = items.filter((i) => i.category !== "planned");
      // Today's plan: approved planned items from the latest entry that has any,
      // looking no later than the day after the period.
      const cap = addDays(data.end, 1) > today ? today : addDays(data.end, 1);
      const { data: plannedRows } = await supabase
        .from("items")
        .select("item_date, category, text, impact_note")
        .eq("user_id", userId)
        .eq("status", "approved")
        .eq("category", "planned")
        .lte("item_date", cap)
        .order("item_date", { ascending: false })
        .limit(50);
      const latestPlanDate = plannedRows?.[0]?.item_date;
      const plan: ItemRow[] = (plannedRows ?? []).filter((r) => r.item_date === latestPlanDate);
      const latest = latestPlanDate ? { entry_date: latestPlanDate } : null;
      const meetings = extras.meetings ?? null;
      if (!done.length && !plan.length && !meetings?.length) {
        return { ok: false as const, error: "No approved items for this period. Approve items on the Log page first." };
      }

      const { data: notes } = await supabase
        .from("daily_entries")
        .select("entry_date, raw_note")
        .eq("user_id", userId)
        .gte("entry_date", data.start)
        .lte("entry_date", latest?.entry_date && latest.entry_date > data.end ? latest.entry_date : data.end);
      const noteText = (notes ?? []).map((n) => n.raw_note.trim()).filter(Boolean).join("\n\n");
      let blockers: string[] = [];
      if (noteText) {
        try {
          const res = await generateStructured({
            instructions:
              "Extract blockers from a developer's daily notes. A blocker is something the note explicitly says is blocking, stuck, waiting on someone, or preventing progress. Return each as one short sentence in first person. If none are explicitly mentioned, return an empty list. Never invent blockers. No em dashes.",
            prompt: noteText,
            schema: blockersSchema,
          });
          blockers = res.blockers.map((b) => stripDashes(b.trim())).filter(Boolean);
        } catch (e) {
          return aiFail(e);
        }
      }
      markdown = [
        `# Standup`,
        "",
        `**Yesterday**`,
        list(done, "- Nothing approved yet"),
        "",
        ...(meetings ? [`**Meetings**`, meetingsToMarkdown(meetings, tz), ""] : []),
        `**Today**`,
        list(plan, "- Nothing planned yet"),
        "",
        `**Blockers**`,
        blockers.length ? blockers.map((b) => `- ${b}`).join("\n") : "- None",
      ].join("\n");
    } else {
      if (!items.length) {
        return { ok: false as const, error: "No approved items in this period. Approve items on the Log page first." };
      }
      const done = items.filter((i) => i.category !== "planned" && i.category !== "in_progress");
      let summary = "";
      try {
        const res = await generateStructured({
          instructions:
            data.type === "weekly"
              ? "Write a short summary paragraph (2 to 4 sentences) of a developer's week from their approved work items. First person, past tense, plain and direct. Use only facts in the items. No marketing language, no em dashes, no numbers that are not in the items."
              : "Write a short summary paragraph (2 to 3 sentences) for an appraisal or portfolio from a developer's approved work items. First person, plain and direct. Use only facts in the items. No marketing language, no em dashes, no numbers that are not in the items.",
          prompt: (done.length ? done : items).map((i) => `[${i.category}] ${i.text}${i.impact_note ? ` (${i.impact_note})` : ""}`).join("\n"),
          schema: summarySchema,
        });
        summary = stripDashes(res.summary.trim());
      } catch (e) {
        return aiFail(e);
      }

      if (data.type === "weekly") {
        markdown = [
          `# Weekly summary, ${formatLongDate(data.start)} to ${formatLongDate(data.end)}`,
          "",
          summary,
          "",
          `## ${CATEGORY_LABELS.shipped}`,
          list(by(["shipped"])),
          "",
          `## ${CATEGORY_LABELS.fixed}`,
          list(by(["fixed"])),
          "",
          `## Reviewed and helped`,
          list(by(["reviewed", "helped"])),
          "",
          `## ${CATEGORY_LABELS.learned}`,
          list(by(["learned"])),
          "",
          `## Next week plan`,
          list([...by(["in_progress"]), ...by(["planned"])]),
          "",
          `## Stats`,
          statsToMarkdown(stats),
        ].join("\n");
      } else {
        const bragItems = by(["shipped", "fixed", "helped"]);
        const months = new Map<string, ItemRow[]>();
        for (const i of bragItems) {
          const key = i.item_date.slice(0, 7);
          if (!months.has(key)) months.set(key, []);
          months.get(key)!.push(i);
        }
        const sections = Array.from(months.entries())
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([key, rows]) => `## ${formatMonth(`${key}-01`)}\n${rows.map(bullet).join("\n")}`);
        markdown = [
          `# Brag document`,
          "",
          `_${formatLongDate(effectiveStart)} to ${formatLongDate(data.end)}_`,
          "",
          `## Totals`,
          statsToMarkdown(stats),
          `- Approved items shipped, fixed or helped: ${bragItems.length}`,
          "",
          `## Summary`,
          summary,
          "",
          sections.length ? sections.join("\n\n") : "_No shipped, fixed or helped items yet._",
        ].join("\n");
      }
    }

    markdown = stripDashes(markdown);
    const { data: saved, error } = await supabase
      .from("reports")
      .insert({ user_id: userId, type: data.type, period_start: effectiveStart, period_end: data.end, markdown })
      .select("id")
      .single();
    if (error) return { ok: false as const, error: "Could not save the report." };
    return { ok: true as const, id: saved.id, markdown };
}
