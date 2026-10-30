import { CATEGORIES, stripDashes, type Category } from "./constants";

export type RawItem = {
  category: string;
  text: string;
  impact_note: string | null;
  source_activity_ids: string[];
  from_note: boolean;
};

export type GroundingActivity = {
  id: string;
  title: string;
  body_excerpt: string | null;
  additions: number | null;
  deletions: number | null;
};

export type CleanItem = {
  category: Category;
  text: string;
  impact_note: string | null;
  source_activity_ids: string[];
  from_note: boolean;
};

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

/**
 * Validate model output against the evidence:
 * - unknown categories and unknown activity ids are dropped
 * - items with no linked activity and from_note false are dropped
 * - an impact note whose numbers are not in the note or linked data is cleared
 * - em dashes are removed
 */
export function groundItems(
  items: RawItem[],
  note: string,
  activity: GroundingActivity[],
): CleanItem[] {
  const byId = new Map(activity.map((a) => [a.id, a]));
  const noteNumbers = new Set(numbersIn(note));
  const out: CleanItem[] = [];

  for (const item of items) {
    if (!(CATEGORIES as readonly string[]).includes(item.category)) continue;
    const text = stripDashes((item.text ?? "").trim());
    if (!text) continue;
    const ids = Array.from(new Set((item.source_activity_ids ?? []).filter((id) => byId.has(id))));
    const fromNote = item.from_note === true;
    if (ids.length === 0 && !fromNote) continue;

    let impact = item.impact_note ? stripDashes(item.impact_note.trim()) : null;
    if (impact) {
      const linked = ids.map((id) => byId.get(id)!);
      const allowed = new Set<string>(noteNumbers);
      let add = 0;
      let del = 0;
      for (const a of linked) {
        numbersIn(`${a.title} ${a.body_excerpt ?? ""}`).forEach((n) => allowed.add(n));
        if (a.additions != null) {
          allowed.add(String(a.additions));
          add += a.additions;
        }
        if (a.deletions != null) {
          allowed.add(String(a.deletions));
          del += a.deletions;
        }
      }
      allowed.add(String(add));
      allowed.add(String(del));
      allowed.add(String(add + del));
      allowed.add(String(linked.length));
      const nums = numbersIn(impact);
      if (nums.length === 0 || nums.some((n) => !allowed.has(n))) impact = null;
    }

    out.push({
      category: item.category as Category,
      text,
      impact_note: impact || null,
      source_activity_ids: ids,
      from_note: fromNote,
    });
  }
  return out;
}
