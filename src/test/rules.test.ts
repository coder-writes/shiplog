import { describe, expect, it } from "vitest";
import { addDays, dateInTz, presetRange, startOfWeek } from "@/lib/dates";
import { computeStats, computeStreak } from "@/lib/stats";
import { groundItems } from "@/lib/grounding";
import { markdownToSlack } from "@/lib/slack";
import { formatSyncCounts, stripDashes } from "@/lib/constants";

describe("timezone day grouping", () => {
  it("puts 20:00 UTC on the next day in Asia/Kolkata", () => {
    expect(dateInTz("2026-10-25T20:00:00Z", "Asia/Kolkata")).toBe("2026-10-26");
  });
  it("keeps 18:00 UTC on the same day in Asia/Kolkata (23:30 IST)", () => {
    expect(dateInTz("2026-10-25T18:00:00Z", "Asia/Kolkata")).toBe("2026-10-25");
  });
});

describe("week start setting", () => {
  it("starts the week on Monday by default", () => {
    // 2026-10-28 is a Wednesday
    expect(startOfWeek("2026-10-28", "monday")).toBe("2026-10-26");
  });
  it("starts the week on Sunday when chosen", () => {
    expect(startOfWeek("2026-10-28", "sunday")).toBe("2026-10-25");
  });
  it("last week is the 7 days before this week's start", () => {
    expect(presetRange("last_week", "2026-10-28", "monday")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  });
});

describe("days logged in a row", () => {
  it("counts consecutive logged days ending today", () => {
    expect(computeStreak(["2026-10-26", "2026-10-25", "2026-10-24", "2026-10-22"], "2026-10-26")).toBe(3);
  });
  it("does not reset when today is not logged yet", () => {
    expect(computeStreak(["2026-10-25", "2026-10-24"], "2026-10-26")).toBe(2);
  });
});

describe("stats", () => {
  it("counts lines only from merged PRs and repos distinctly", () => {
    const s = computeStats(
      [
        { type: "commit", repo: "a/x", additions: null, deletions: null },
        { type: "pr_merged", repo: "a/x", additions: 100, deletions: 20 },
        { type: "pr_merged", repo: "a/y", additions: 5, deletions: 1 },
        { type: "issue_comment", repo: "a/y", additions: null, deletions: null },
        { type: "pr_comment", repo: "a/z", additions: null, deletions: null },
      ],
      [],
      addDays("2026-10-26", 0),
    );
    expect(s.linesAdded).toBe(105);
    expect(s.linesRemoved).toBe(21);
    expect(s.reposTouched).toBe(3);
    expect(s.comments).toBe(2);
    expect(s.prsMerged).toBe(2);
  });
});

describe("item grounding", () => {
  const activity = [{ id: "a1", title: "fix: sync retry", body_excerpt: null, additions: 142, deletions: 37 }];

  it("drops items with no source and from_note false", () => {
    const out = groundItems(
      [{ category: "shipped", text: "I shipped a thing.", impact_note: null, source_activity_ids: [], from_note: false }],
      "",
      activity,
    );
    expect(out).toHaveLength(0);
  });

  it("drops unknown activity ids but keeps the item if it came from the note", () => {
    const out = groundItems(
      [{ category: "fixed", text: "I fixed the sync bug.", impact_note: null, source_activity_ids: ["a1", "nope"], from_note: true }],
      "fixed the sync bug",
      activity,
    );
    expect(out[0]?.source_activity_ids).toEqual(["a1"]);
  });

  it("clears an impact note with a number not in the evidence", () => {
    const out = groundItems(
      [{ category: "fixed", text: "I fixed it.", impact_note: "Saved 40% of sync time", source_activity_ids: ["a1"], from_note: false }],
      "",
      activity,
    );
    expect(out[0]?.impact_note).toBeNull();
  });

  it("keeps an impact note built from linked line counts", () => {
    const out = groundItems(
      [{ category: "fixed", text: "I fixed it.", impact_note: "+142 / -37 lines", source_activity_ids: ["a1"], from_note: false }],
      "",
      activity,
    );
    expect(out[0]?.impact_note).toBe("+142 / -37 lines");
  });

  it("removes em dashes from item text", () => {
    const out = groundItems(
      [{ category: "learned", text: "I learned a lot \u2014 mostly about caching.", impact_note: null, source_activity_ids: [], from_note: true }],
      "learned about caching",
      activity,
    );
    expect(out[0]?.text).not.toContain("\u2014");
  });
});

describe("text output", () => {
  it("never leaves em dashes", () => {
    expect(stripDashes("Done \u2014 next")).toBe("Done, next");
  });
  it("formats the sync result line", () => {
    expect(
      formatSyncCounts({ commit: 12, pr_opened: 2, pr_merged: 1, issue_opened: 2, issue_comment: 4, pr_comment: 2, review: 4 }),
    ).toBe("Fetched 12 commits, 3 PRs, 2 issues, 6 comments, 4 reviews");
  });
  it("converts markdown to Slack formatting", () => {
    expect(markdownToSlack("## Shipped\n- **Export** done [PR](https://x.y/1)")).toBe(
      "*Shipped*\n• *Export* done <https://x.y/1|PR>",
    );
  });
});

import { weeklyEmailDue, markdownToEmailHtml, lastCompletedWeek } from "@/lib/weekly-email";

describe("weekly report email", () => {
  // 2026-10-26 is a Monday
  it("sends last week on Monday from 9 am for a Monday week start", () => {
    expect(weeklyEmailDue({ today: "2026-10-26", localHour: 9, weekStart: "monday", lastSentPeriod: null })).toEqual({
      start: "2026-10-19",
      end: "2026-10-25",
    });
  });
  it("waits until 9 am", () => {
    expect(weeklyEmailDue({ today: "2026-10-26", localHour: 8, weekStart: "monday", lastSentPeriod: null })).toBeNull();
  });
  it("only sends on the first day of the week", () => {
    expect(weeklyEmailDue({ today: "2026-10-27", localHour: 10, weekStart: "monday", lastSentPeriod: null })).toBeNull();
  });
  it("sends on Sunday for a Sunday week start", () => {
    expect(weeklyEmailDue({ today: "2026-10-25", localHour: 9, weekStart: "sunday", lastSentPeriod: null })).toEqual({
      start: "2026-10-18",
      end: "2026-10-24",
    });
  });
  it("never sends the same week twice", () => {
    expect(weeklyEmailDue({ today: "2026-10-26", localHour: 11, weekStart: "monday", lastSentPeriod: "2026-10-19" })).toBeNull();
  });
  it("send now picks the last completed week", () => {
    expect(lastCompletedWeek("2026-10-28", "monday")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  });
  it("escapes HTML from item text in the email", () => {
    expect(markdownToEmailHtml("- fixed <script> tag")).toContain("fixed &lt;script&gt; tag");
  });
});

import { busiestRepos, categoryMixByWeek, heatLevel, heatmapWeeks, longestStreak, reviewToCode } from "@/lib/insights";
import { signShareToken, verifyShareToken, shareExpiry } from "@/lib/share-token";
import { meetingsToMarkdown, toMeetings } from "@/lib/meetings";

describe("insights", () => {
  it("review to code ratio is reviews over commits plus PRs opened", () => {
    const a = [{ type: "review" }, { type: "review" }, { type: "commit" }, { type: "commit" }, { type: "pr_opened" }, { type: "pr_merged" }];
    expect(reviewToCode(a)).toEqual({ reviews: 2, code: 3, ratio: 2 / 3 });
  });
  it("ratio is empty when there is no code", () => {
    expect(reviewToCode([{ type: "review" }]).ratio).toBeNull();
  });
  it("ranks busiest repos by total activity", () => {
    const act = [
      { activity_date: "2026-10-20", type: "commit", repo: "a/x" },
      { activity_date: "2026-10-20", type: "commit", repo: "b/y" },
      { activity_date: "2026-10-21", type: "review", repo: "b/y" },
    ];
    expect(busiestRepos(act).map((r) => [r.repo, r.total])).toEqual([["b/y", 2], ["a/x", 1]]);
  });
  it("longest streak finds the best run of logged days", () => {
    expect(longestStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-11"])).toBe(3);
  });
  it("heat levels bucket daily counts", () => {
    expect([0, 1, 3, 6, 10].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });
  it("heatmap counts activity plus one for a note on that day", () => {
    const weeks = heatmapWeeks([{ activity_date: "2026-10-20", type: "commit", repo: "a" }], ["2026-10-20"], "2026-10-19", "2026-10-25", "monday");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]![1]).toMatchObject({ date: "2026-10-20", count: 2 });
  });
  it("category mix groups approved items by week start", () => {
    const rows = categoryMixByWeek(
      [{ item_date: "2026-10-20", category: "shipped" }, { item_date: "2026-10-27", category: "fixed" }],
      "2026-10-19", "2026-10-28", "monday",
    );
    expect(rows.map((r) => [r.week, r.shipped, r.fixed])).toEqual([["2026-10-19", 1, 0], ["2026-10-26", 0, 1]]);
  });
});

describe("share links", () => {
  const key = "test-signing-key-test-signing-key";
  const id = "0cef3df9-c8ee-49d8-a5d6-2394a5e07688";
  it("accepts a valid signed link before it expires", async () => {
    const t = await signShareToken(key, id, new Date("2026-11-02T00:00:00Z"));
    expect(await verifyShareToken(key, t, new Date("2026-10-30T00:00:00Z"))).toMatchObject({ ok: true, shareId: id });
  });
  it("rejects an expired link", async () => {
    const t = await signShareToken(key, id, new Date("2026-11-02T00:00:00Z"));
    expect(await verifyShareToken(key, t, new Date("2026-11-03T00:00:00Z"))).toEqual({ ok: false, reason: "expired" });
  });
  it("rejects a link whose expiry was edited", async () => {
    const t = await signShareToken(key, id, new Date("2026-11-02T00:00:00Z"));
    const [a, , c] = t.split(".");
    expect(await verifyShareToken(key, `${a}.9999999999.${c}`, new Date("2026-10-30T00:00:00Z"))).toEqual({ ok: false, reason: "invalid" });
  });
  it("7 day links expire 7 days after creation", () => {
    expect(shareExpiry(7, new Date("2026-10-26T00:00:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
});

describe("calendar meetings", () => {
  const ev = (over: object) => ({ id: "e1", summary: "Sprint planning", start: { dateTime: "2026-10-26T04:30:00Z" }, end: { dateTime: "2026-10-26T05:15:00Z" }, ...over });
  it("keeps a timed meeting on its local day with its length", () => {
    expect(toMeetings([ev({})], "Asia/Kolkata", "2026-10-26", "2026-10-26")).toMatchObject([{ date: "2026-10-26", minutes: 45 }]);
  });
  it("skips declined, cancelled, all-day and out of office entries", () => {
    const events = [
      ev({ id: "d", attendees: [{ self: true, responseStatus: "declined" }] }),
      ev({ id: "c", status: "cancelled" }),
      { id: "a", summary: "Holiday", start: { date: "2026-10-26" }, end: { date: "2026-10-27" } },
      ev({ id: "o", eventType: "outOfOffice" }),
    ];
    expect(toMeetings(events, "Asia/Kolkata", "2026-10-26", "2026-10-26")).toEqual([]);
  });
  it("standup lists meetings with local time and length", () => {
    const m = toMeetings([ev({})], "Asia/Kolkata", "2026-10-26", "2026-10-26");
    expect(meetingsToMarkdown(m, "Asia/Kolkata")).toBe("- 10:00 Sprint planning (45 min)");
  });
});
