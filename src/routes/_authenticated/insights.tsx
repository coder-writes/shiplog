import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { approvedItemsRangeQuery, insightsActivityQuery, loggedDatesQuery, profileQuery } from "@/lib/queries";
import { addDays, formatShortDate, todayInTz, type WeekStart } from "@/lib/dates";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/constants";
import { computeStreak } from "@/lib/stats";
import {
  busiestRepos,
  categoryMixByWeek,
  heatmapWeeks,
  longestStreak,
  reviewToCode,
  reviewToCodeByWeek,
  type HeatCell,
} from "@/lib/insights";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Insights | ShipLog" },
      { name: "description", content: "Your contribution heatmap, category mix, review-to-code ratio, busiest repos and streak." },
      { property: "og:title", content: "Insights | ShipLog" },
      { property: "og:description", content: "Your contribution heatmap, category mix, review-to-code ratio, busiest repos and streak." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InsightsPage,
});

const RANGES = [
  { weeks: 12, label: "12 weeks" },
  { weeks: 26, label: "6 months" },
  { weeks: 52, label: "1 year" },
] as const;

const CATEGORY_COLORS: Record<(typeof CATEGORIES)[number], string> = {
  shipped: "var(--chart-1)",
  fixed: "var(--chart-5)",
  reviewed: "var(--chart-4)",
  helped: "var(--chart-2)",
  learned: "var(--chart-3)",
  in_progress: "var(--chart-6)",
  planned: "var(--chart-7)",
};

const mixConfig = Object.fromEntries(
  CATEGORIES.map((c) => [c, { label: CATEGORY_LABELS[c], color: CATEGORY_COLORS[c] }]),
) satisfies ChartConfig;

const ratioConfig = {
  reviews: { label: "Reviews", color: "var(--chart-4)" },
  code: { label: "Commits and PRs opened", color: "var(--chart-1)" },
} satisfies ChartConfig;

const HEAT_CLASS: Record<HeatCell["level"], string> = {
  0: "bg-heat-0",
  1: "bg-primary/25",
  2: "bg-primary/45",
  3: "bg-primary/70",
  4: "bg-primary",
};

function InsightsPage() {
  const profile = useQuery(profileQuery());
  if (profile.isLoading) return <LoadingState label="Loading insights" />;
  if (profile.error || !profile.data) return <ErrorState message="Could not load your profile." onRetry={() => profile.refetch()} />;
  return <Insights timezone={profile.data.timezone} weekStart={profile.data.week_starts_on as WeekStart} />;
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-7">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="font-display mt-1 text-2xl text-foreground">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Insights({ timezone, weekStart }: { timezone: string; weekStart: WeekStart }) {
  const today = todayInTz(timezone);
  const [weeks, setWeeks] = useState<number>(26);
  const start = addDays(today, -(weeks * 7 - 1));

  const activity = useQuery(insightsActivityQuery(start, today));
  const items = useQuery(approvedItemsRangeQuery(start, today));
  const logged = useQuery(loggedDatesQuery());

  const data = useMemo(() => {
    const act = activity.data ?? [];
    const loggedInRange = (logged.data ?? []).filter((d) => d >= start && d <= today);
    return {
      heat: heatmapWeeks(act, loggedInRange, start, today, weekStart),
      mix: categoryMixByWeek(items.data ?? [], start, today, weekStart),
      ratio: reviewToCode(act),
      ratioWeeks: reviewToCodeByWeek(act, start, today, weekStart),
      repos: busiestRepos(act, 6),
      current: computeStreak(logged.data ?? [], today),
      longest: longestStreak(logged.data ?? []),
      activeDays: new Set([...act.map((a) => a.activity_date), ...loggedInRange]).size,
      total: act.length,
    };
  }, [activity.data, items.data, logged.data, start, today, weekStart]);

  const loading = activity.isLoading || items.isLoading || logged.isLoading;
  const error = activity.error || items.error || logged.error;
  const weekTick = (w: string) => formatShortDate(w).replace(/ \d{4}$/, "");

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Insights</p>
          <h1 className="font-display mt-2 text-5xl leading-[1.05] text-foreground sm:text-6xl">
            How you work, <em className="italic">over time.</em>
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">Counted from your GitHub activity, notes and approved items.</p>
        </div>
        <div className="flex rounded-full bg-muted p-1 text-sm" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.weeks}
              role="tab"
              aria-selected={weeks === r.weeks}
              onClick={() => setWeeks(r.weeks)}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                weeks === r.weeks ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState label="Counting your work" />
      ) : error ? (
        <ErrorState message="Could not load your insights." onRetry={() => { activity.refetch(); items.refetch(); logged.refetch(); }} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Current streak" value={`${data.current} ${data.current === 1 ? "day" : "days"}`} hint="Days logged in a row" />
            <Stat label="Longest streak" value={`${data.longest} ${data.longest === 1 ? "day" : "days"}`} hint="Best run ever" />
            <Stat label="Active days" value={String(data.activeDays)} hint={`In the last ${weeks} weeks`} />
            <Stat
              label="Review to code"
              value={data.ratio.ratio === null ? "No code yet" : `${data.ratio.ratio.toFixed(2)} : 1`}
              hint={`${data.ratio.reviews} ${data.ratio.reviews === 1 ? "review" : "reviews"}, ${data.ratio.code} ${data.ratio.code === 1 ? "commit or PR" : "commits and PRs"}`}
            />
          </div>

          <Panel eyebrow="Contributions" title={<>Every day, <em className="italic">at a glance</em></>}>
            <Heatmap weeks={data.heat} />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel eyebrow="Category mix" title="Approved items by week">
              {(items.data ?? []).length === 0 ? (
                <EmptyState title="No approved items yet.">Approve items on the Log page to see your mix.</EmptyState>
              ) : (
                <ChartContainer config={mixConfig} className="aspect-auto h-72 w-full">
                  <BarChart data={data.mix} margin={{ left: -20, right: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="week" tickFormatter={weekTick} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={(w) => `Week of ${formatShortDate(String(w))}`} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {CATEGORIES.map((c, i) => (
                      <Bar
                        key={c}
                        dataKey={c}
                        stackId="mix"
                        fill={`var(--color-${c})`}
                        radius={i === CATEGORIES.length - 1 ? [4, 4, 0, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              )}
            </Panel>

            <Panel eyebrow="Review to code" title="Reviews next to code changes">
              {data.total === 0 ? (
                <EmptyState title="No GitHub activity yet.">Sync GitHub on the Log page, or load demo data in Settings.</EmptyState>
              ) : (
                <ChartContainer config={ratioConfig} className="aspect-auto h-72 w-full">
                  <LineChart data={data.ratioWeeks} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="week" tickFormatter={weekTick} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={(w) => `Week of ${formatShortDate(String(w))}`} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line dataKey="code" type="monotone" stroke="var(--color-code)" strokeWidth={2} dot={false} />
                    <Line dataKey="reviews" type="monotone" stroke="var(--color-reviews)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartContainer>
              )}
            </Panel>
          </div>

          <Panel eyebrow="Busiest repos" title="Where your time went">
            {data.repos.length === 0 ? (
              <EmptyState title="No repos yet.">Sync GitHub to see which repos you touched most.</EmptyState>
            ) : (
              <ul className="space-y-4">
                {data.repos.map((r) => (
                  <li key={r.repo}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-foreground">{r.repo}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {r.total} total: {r.commits} commits, {r.prs} PRs, {r.reviews} reviews, {r.comments} comments
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(r.total / data.repos[0]!.total) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-3xl text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Heatmap({ weeks }: { weeks: HeatCell[][] }) {
  const dayLabels = (weeks[0] ?? []).map((c) => new Date(`${c.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }));
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pr-1 text-[10px] text-muted-foreground">
          {dayLabels.map((d, i) => (
            <span key={d} className="h-3 leading-3">{i % 2 === 0 ? d : ""}</span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((col) => (
            <div key={col[0]!.date} className="grid grid-rows-7 gap-[3px]">
              {col.map((c) => (
                <div
                  key={c.date}
                  title={c.inRange ? `${formatShortDate(c.date)}: ${c.count} ${c.count === 1 ? "thing" : "things"} logged` : undefined}
                  className={`h-3 w-3 rounded-[3px] ${c.inRange ? HEAT_CLASS[c.level] : "bg-transparent"}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        Less
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <span key={l} className={`h-3 w-3 rounded-[3px] ${HEAT_CLASS[l]}`} />
        ))}
        More
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Each square counts GitHub activity that day, plus one if you wrote a note.</p>
    </div>
  );
}
