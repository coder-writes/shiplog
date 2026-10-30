import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Download, FileText, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateReport } from "@/lib/ai.functions";
import { activityRangeQuery, loggedDatesQuery, profileQuery, reportsQuery, type Report } from "@/lib/queries";
import { formatDateTimeInTz, formatShortDate, isIsoDate, presetRange, todayInTz, type PeriodPreset, type WeekStart } from "@/lib/dates";
import type { ReportType } from "@/lib/constants";
import { computeStats } from "@/lib/stats";
import { markdownToSlack } from "@/lib/slack";
import { Button } from "@/components/ui/button";
import { StatCards } from "@/components/StatCards";
import { ShareDialog } from "@/components/ShareDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports | ShipLog" },
      { name: "description", content: "Generate a standup, a weekly summary or a brag doc from approved work items." },
      { property: "og:title", content: "Reports | ShipLog" },
      { property: "og:description", content: "Generate a standup, a weekly summary or a brag doc from approved work items." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

const TABS: { type: ReportType; label: string; defaultPreset: Exclude<PeriodPreset, "custom"> }[] = [
  { type: "standup", label: "Standup", defaultPreset: "yesterday" },
  { type: "weekly", label: "Weekly", defaultPreset: "this_week" },
  { type: "brag", label: "Brag", defaultPreset: "all_time" },
];

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "yesterday", label: "Yesterday" },
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "all_time", label: "All time" },
  { id: "custom", label: "Custom" },
];

const TITLES: Record<ReportType, React.ReactNode> = {
  standup: <>Your standup, <em className="italic">in twenty seconds.</em></>,
  weekly: <>The week, <em className="italic">in one page.</em></>,
  brag: <>Everything you shipped, <em className="italic">kept.</em></>,
};

function ReportsPage() {
  const profile = useQuery(profileQuery());
  if (profile.isLoading) return <LoadingState label="Loading reports" />;
  if (profile.error || !profile.data) return <ErrorState message="Could not load your profile." onRetry={() => profile.refetch()} />;
  return <Reports timezone={profile.data.timezone} weekStart={profile.data.week_starts_on as WeekStart} />;
}

function Reports({ timezone, weekStart }: { timezone: string; weekStart: WeekStart }) {
  const qc = useQueryClient();
  const today = todayInTz(timezone);
  const [type, setType] = useState<ReportType>("standup");
  const [preset, setPreset] = useState<PeriodPreset>("yesterday");
  const [custom, setCustom] = useState({ start: today, end: today });
  const [shown, setShown] = useState<Report | null>(null);

  const range = preset === "custom" ? custom : presetRange(preset, today, weekStart);
  const rangeValid = isIsoDate(range.start) && isIsoDate(range.end) && range.start <= range.end;

  const history = useQuery(reportsQuery());
  const activity = useQuery({ ...activityRangeQuery(range.start, range.end), enabled: rangeValid });
  const logged = useQuery(loggedDatesQuery());
  const stats = useMemo(
    () => computeStats(activity.data ?? [], logged.data ?? [], range.end > today ? today : range.end),
    [activity.data, logged.data, range.end, today],
  );

  const generate = useServerFn(generateReport);
  const gen = useMutation({
    mutationFn: async () => {
      const res = await generate({ data: { type, start: range.start, end: range.end } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["reports"] });
      setShown({
        id: res.id,
        markdown: res.markdown,
        type,
        period_start: range.start,
        period_end: range.end,
        created_at: new Date().toISOString(),
        user_id: "",
      });
    },
  });

  const selectTab = (t: (typeof TABS)[number]) => {
    setType(t.type);
    setPreset(t.defaultPreset);
    setShown(null);
    gen.reset();
  };

  const typeHistory = (history.data ?? []).filter((r) => r.type === type);
  const current = shown && shown.type === type ? shown : null;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  }

  function download(r: Report) {
    const blob = new Blob([r.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shiplog-${r.type}-${r.period_start}${r.period_end !== r.period_start ? `-to-${r.period_end}` : ""}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow">Reports</p>
        <h1 className="font-display mt-2 text-5xl leading-[1.05] text-foreground sm:text-6xl">{TITLES[type]}</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">Built only from items you approved and stats counted from your activity.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-full bg-muted p-1 text-sm" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.type}
              role="tab"
              aria-selected={type === t.type}
              onClick={() => selectTab(t)}
              className={`rounded-full px-5 py-1.5 font-medium transition-colors ${
                type === t.type ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.filter((p) => p.id !== "all_time" || type === "brag").map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                preset === p.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <input
              type="date"
              aria-label="Start date"
              value={custom.start}
              onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
              className="h-9 rounded-md border bg-background px-2"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              aria-label="End date"
              value={custom.end}
              onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
              className="h-9 rounded-md border bg-background px-2"
            />
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {rangeValid
              ? preset === "all_time"
                ? `Everything up to ${formatShortDate(range.end)}`
                : range.start === range.end
                  ? formatShortDate(range.start)
                  : `${formatShortDate(range.start)} to ${formatShortDate(range.end)}`
              : "Pick a valid date range."}
          </p>
          <Button variant="cta" onClick={() => gen.mutate()} disabled={!rangeValid || gen.isPending}>
            {gen.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {gen.isPending ? "Writing" : `Generate ${TABS.find((t) => t.type === type)!.label.toLowerCase()}`}
          </Button>
        </div>
        {gen.error && (
          <div className="mt-4">
            <ErrorState message={gen.error.message} />
          </div>
        )}
      </div>

      {rangeValid && (
        <section>
          <p className="eyebrow mb-3">Stats for this period</p>
          {activity.isLoading ? <LoadingState /> : activity.error ? <ErrorState message="Could not load stats." /> : <StatCards stats={stats} />}
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0">
          {current ? (
            <div className="rounded-2xl border bg-card">
              <div className="flex flex-wrap items-center gap-1 border-b px-4 py-3">
                <Button size="sm" variant="ghost" onClick={() => copy(current.markdown, "Markdown copied.")}>
                  <Copy /> Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copy(markdownToSlack(current.markdown), "Copied for Slack.")}>
                  <MessageSquare /> Copy for Slack
                </Button>
                <Button size="sm" variant="ghost" onClick={() => download(current)}>
                  <Download /> Download .md
                </Button>
                {current.id && <ShareDialog reportId={current.id} timezone={timezone} />}
              </div>
              <article className="prose-shiplog px-6 py-6 text-[15px] text-foreground sm:px-8">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.markdown}</ReactMarkdown>
              </article>
            </div>
          ) : (
            <EmptyState title="No report open.">Generate one above, or open an earlier one from the history.</EmptyState>
          )}
        </section>

        <aside>
          <p className="eyebrow mb-3">History</p>
          {history.isLoading ? (
            <LoadingState />
          ) : history.error ? (
            <ErrorState message="Could not load history." onRetry={() => history.refetch()} />
          ) : typeHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing generated yet.</p>
          ) : (
            <ul className="space-y-1">
              {typeHistory.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setShown(r)}
                    className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                      current?.id === r.id ? "bg-card ring-1 ring-border" : "hover:bg-accent"
                    }`}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      <span className="block text-sm text-foreground">
                        {r.period_start === r.period_end ? formatShortDate(r.period_start) : `${formatShortDate(r.period_start)} to ${formatShortDate(r.period_end)}`}
                      </span>
                      <span className="block text-xs text-muted-foreground">Made {formatDateTimeInTz(r.created_at, timezone)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
