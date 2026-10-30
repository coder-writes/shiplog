// Pure insight calculations. All numbers are counted in code from stored rows.
import { addDays, startOfWeek, type WeekStart } from "./dates";
import { CATEGORIES, type Category } from "./constants";

export type InsightActivity = { activity_date: string; type: string; repo: string };
export type InsightItem = { item_date: string; category: string };

export type HeatCell = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4; inRange: boolean };

/** Activity level for a day: 0 none, then 1-2, 3-5, 6-9, 10+. */
export function heatLevel(count: number): HeatCell["level"] {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

/**
 * Week columns from the week containing `start` to the week containing `end`.
 * Each column has 7 days in week order. Days outside [start, end] are marked out of range.
 */
export function heatmapWeeks(
  activity: InsightActivity[],
  loggedDates: Iterable<string>,
  start: string,
  end: string,
  weekStart: WeekStart,
): HeatCell[][] {
  const counts = new Map<string, number>();
  for (const a of activity) counts.set(a.activity_date, (counts.get(a.activity_date) ?? 0) + 1);
  // A logged note counts as one unit of work for the day.
  for (const d of loggedDates) counts.set(d, (counts.get(d) ?? 0) + 1);

  const weeks: HeatCell[][] = [];
  for (let w = startOfWeek(start, weekStart); w <= end; w = addDays(w, 7)) {
    const col: HeatCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(w, i);
      const inRange = date >= start && date <= end;
      const count = inRange ? (counts.get(date) ?? 0) : 0;
      col.push({ date, count, level: inRange ? heatLevel(count) : 0, inRange });
    }
    weeks.push(col);
  }
  return weeks;
}

export type CategoryWeek = { week: string } & Record<Category, number>;

/** Approved items per category, one row per week from start to end. */
export function categoryMixByWeek(items: InsightItem[], start: string, end: string, weekStart: WeekStart): CategoryWeek[] {
  const rows = new Map<string, CategoryWeek>();
  for (let w = startOfWeek(start, weekStart); w <= end; w = addDays(w, 7)) {
    const row = { week: w } as CategoryWeek;
    for (const c of CATEGORIES) row[c] = 0;
    rows.set(w, row);
  }
  for (const i of items) {
    if (i.item_date < start || i.item_date > end) continue;
    const row = rows.get(startOfWeek(i.item_date, weekStart));
    if (row && (CATEGORIES as readonly string[]).includes(i.category)) row[i.category as Category] += 1;
  }
  return Array.from(rows.values());
}

/** Code changes are commits plus pull requests opened. */
export function reviewToCode(activity: { type: string }[]): { reviews: number; code: number; ratio: number | null } {
  const reviews = activity.filter((a) => a.type === "review").length;
  const code = activity.filter((a) => a.type === "commit" || a.type === "pr_opened").length;
  return { reviews, code, ratio: code === 0 ? null : reviews / code };
}

export type RatioWeek = { week: string; reviews: number; code: number };

export function reviewToCodeByWeek(activity: InsightActivity[], start: string, end: string, weekStart: WeekStart): RatioWeek[] {
  const rows = new Map<string, RatioWeek>();
  for (let w = startOfWeek(start, weekStart); w <= end; w = addDays(w, 7)) rows.set(w, { week: w, reviews: 0, code: 0 });
  for (const a of activity) {
    if (a.activity_date < start || a.activity_date > end) continue;
    const row = rows.get(startOfWeek(a.activity_date, weekStart));
    if (!row) continue;
    if (a.type === "review") row.reviews += 1;
    else if (a.type === "commit" || a.type === "pr_opened") row.code += 1;
  }
  return Array.from(rows.values());
}

export type RepoRow = { repo: string; total: number; commits: number; prs: number; reviews: number; comments: number };

/** Repos ranked by total activity, ties broken by name. */
export function busiestRepos(activity: InsightActivity[], limit = 5): RepoRow[] {
  const map = new Map<string, RepoRow>();
  for (const a of activity) {
    const r = map.get(a.repo) ?? { repo: a.repo, total: 0, commits: 0, prs: 0, reviews: 0, comments: 0 };
    r.total += 1;
    if (a.type === "commit") r.commits += 1;
    else if (a.type === "pr_opened" || a.type === "pr_merged") r.prs += 1;
    else if (a.type === "review") r.reviews += 1;
    else if (a.type === "issue_comment" || a.type === "pr_comment") r.comments += 1;
    map.set(a.repo, r);
  }
  return Array.from(map.values())
    .sort((x, y) => y.total - x.total || x.repo.localeCompare(y.repo))
    .slice(0, limit);
}

/** Longest run of consecutive logged days ever. */
export function longestStreak(loggedDates: Iterable<string>): number {
  const days = Array.from(new Set(loggedDates)).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
