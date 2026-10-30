import { addDays } from "./dates";
import type { ActivityType } from "./constants";

export type StatActivity = {
  type: ActivityType | string;
  repo: string;
  additions: number | null;
  deletions: number | null;
};

export type Stats = {
  commits: number;
  prsOpened: number;
  prsMerged: number;
  issuesOpened: number;
  comments: number;
  reviews: number;
  reposTouched: number;
  linesAdded: number;
  linesRemoved: number;
  streak: number;
};

/**
 * Count consecutive logged days ending at `referenceDate`. If the reference day
 * has no note yet, counting starts from the day before so an unlogged "today"
 * does not reset the streak.
 */
export function computeStreak(loggedDates: Iterable<string>, referenceDate: string): number {
  const set = new Set(loggedDates);
  let cursor = set.has(referenceDate) ? referenceDate : addDays(referenceDate, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Line counts come from merged PRs (commit search results carry no diff stats). */
export function computeStats(
  activity: StatActivity[],
  loggedDates: Iterable<string>,
  referenceDate: string,
): Stats {
  const count = (t: string) => activity.filter((a) => a.type === t).length;
  const merged = activity.filter((a) => a.type === "pr_merged");
  return {
    commits: count("commit"),
    prsOpened: count("pr_opened"),
    prsMerged: merged.length,
    issuesOpened: count("issue_opened"),
    comments: count("issue_comment") + count("pr_comment"),
    reviews: count("review"),
    reposTouched: new Set(activity.map((a) => a.repo)).size,
    linesAdded: merged.reduce((s, a) => s + (a.additions ?? 0), 0),
    linesRemoved: merged.reduce((s, a) => s + (a.deletions ?? 0), 0),
    streak: computeStreak(loggedDates, referenceDate),
  };
}

export function statsToMarkdown(stats: Stats): string {
  return [
    `- Commits: ${stats.commits}`,
    `- Pull requests opened: ${stats.prsOpened}`,
    `- Pull requests merged: ${stats.prsMerged}`,
    `- Issues opened: ${stats.issuesOpened}`,
    `- Comments: ${stats.comments}`,
    `- Reviews: ${stats.reviews}`,
    `- Repos touched: ${stats.reposTouched}`,
    `- Lines added / removed (merged PRs): +${stats.linesAdded} / -${stats.linesRemoved}`,
    `- Days logged in a row: ${stats.streak}`,
  ].join("\n");
}
