export const ACTIVITY_TYPES = [
  "commit",
  "pr_opened",
  "pr_merged",
  "issue_opened",
  "issue_comment",
  "pr_comment",
  "review",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  commit: "Commits",
  pr_opened: "Pull requests opened",
  pr_merged: "Pull requests merged",
  issue_opened: "Issues opened",
  issue_comment: "Issue comments",
  pr_comment: "Pull request comments",
  review: "Reviews",
};

export const ACTIVITY_SHORT: Record<ActivityType, string> = {
  commit: "commit",
  pr_opened: "PR opened",
  pr_merged: "PR merged",
  issue_opened: "issue",
  issue_comment: "comment",
  pr_comment: "PR comment",
  review: "review",
};

export const CATEGORIES = [
  "shipped",
  "fixed",
  "reviewed",
  "helped",
  "learned",
  "in_progress",
  "planned",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  shipped: "Shipped",
  fixed: "Fixed",
  reviewed: "Reviewed",
  helped: "Helped",
  learned: "Learned",
  in_progress: "In progress",
  planned: "Planned",
};

export const ITEM_STATUSES = ["pending", "approved", "rejected"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const REPORT_TYPES = ["standup", "weekly", "brag"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const IMPACT_PROMPT = "Any numbers on this? Users, time saved, speed, bugs closed.";

export const TOKEN_HELP_TEXT =
  "Create a fine grained token with read access to metadata, contents, issues and pull requests. If your repos are in an organization with SSO, authorize the token for that organization.";

/** Summarise sync counts the way the main screen shows them. */
export function formatSyncCounts(counts: Partial<Record<ActivityType, number>>): string {
  const n = (k: ActivityType) => counts[k] ?? 0;
  const prs = n("pr_opened") + n("pr_merged");
  const comments = n("issue_comment") + n("pr_comment");
  const plural = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  return `Fetched ${plural(n("commit"), "commit", "commits")}, ${plural(prs, "PR", "PRs")}, ${plural(
    n("issue_opened"),
    "issue",
    "issues",
  )}, ${plural(comments, "comment", "comments")}, ${plural(n("review"), "review", "reviews")}`;
}

/** Replace em and en dashes, which the product bans from generated text. */
export function stripDashes(text: string): string {
  return text
    .replace(/\s*[\u2014]\s*/g, ", ")
    .replace(/\s*[\u2013]\s*/g, " - ")
    .replace(/,\s*,/g, ",");
}
