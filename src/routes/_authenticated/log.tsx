import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarIcon, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { syncGithub } from "@/lib/github.functions";
import { activityQuery, connectionStatusQuery, loggedDatesQuery, profileQuery } from "@/lib/queries";
import { addDays, formatDateTimeInTz, formatDayMonth, formatWeekday, isIsoDate, todayInTz } from "@/lib/dates";
import { formatSyncCounts } from "@/lib/constants";
import { computeStats } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NoteEditor } from "@/components/log/NoteEditor";
import { EntryList } from "@/components/log/EntryList";
import { ActivityPanel } from "@/components/log/ActivityPanel";
import { ItemsReview } from "@/components/log/ItemsReview";
import { MeetingsPanel } from "@/components/log/MeetingsPanel";
import { StatCards } from "@/components/StatCards";
import { ErrorState, LoadingState, SectionTitle } from "@/components/States";

export const Route = createFileRoute("/_authenticated/log")({
  validateSearch: (s: Record<string, unknown>): { date?: string | undefined } => {
    const d = s["date"];
    return { date: typeof d === "string" && isIsoDate(d) ? d : undefined };
  },
  head: () => ({
    meta: [
      { title: "Daily log | ShipLog" },
      { name: "description", content: "Dictate today's work, see your GitHub activity and review work items." },
      { property: "og:title", content: "Daily log | ShipLog" },
      { property: "og:description", content: "Dictate today's work, see your GitHub activity and review work items." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LogPage,
});

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function LogPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/log" });
  const profile = useQuery(profileQuery());

  if (profile.isLoading) return <LoadingState label="Loading your log" />;
  if (profile.error || !profile.data)
    return <ErrorState message="Could not load your profile." onRetry={() => profile.refetch()} />;

  const tz = profile.data.timezone;
  const today = todayInTz(tz);
  const date = search.date ?? today;
  const go = (d: string) => navigate({ search: { date: d } });

  return (
    <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="order-2 lg:order-1">
        <EntryList selected={date} />
      </div>

      <div className="order-1 min-w-0 space-y-14 lg:order-2">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>
              <ChevronLeft />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon /> Pick a date
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(`${date}T12:00:00`)}
                  onSelect={(d) => d && go(toIso(d))}
                  className="pointer-events-auto p-3"
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => go(addDays(date, 1))}>
              <ChevronRight />
            </Button>
            {date !== today && (
              <Button variant="ghost" onClick={() => go(today)}>
                Today
              </Button>
            )}
            <div className="ml-auto">
              <SyncButton timezone={tz} />
            </div>
          </div>
          <p className="eyebrow mt-10">{date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : "Entry"}</p>
          <h1 className="font-display mt-2 text-5xl leading-[1.05] text-foreground sm:text-6xl">
            {formatWeekday(date)}, <em className="italic">{formatDayMonth(date)}</em>
          </h1>
        </header>

        <NoteEditor key={date} date={date} userId={user.id} />

        <DaySections date={date} timezone={tz} />
      </div>
    </div>
  );
}

function DaySections({ date, timezone }: { date: string; timezone: string }) {
  const activity = useQuery(activityQuery(date));
  const logged = useQuery(loggedDatesQuery());
  const stats = useMemo(
    () => computeStats(activity.data ?? [], logged.data ?? [], date),
    [activity.data, logged.data, date],
  );

  return (
    <>
      <section>
        <SectionTitle eyebrow="At a glance" title="Stats for this day" />
        <StatCards stats={stats} />
      </section>

      <ItemsReview date={date} activity={activity.data ?? []} />

      <MeetingsPanel date={date} timezone={timezone} />

      <section>
        <SectionTitle eyebrow="Evidence" title={<>GitHub activity <em className="italic">for this day</em></>} />
        <ActivityPanel
          activity={activity.data ?? undefined}
          isLoading={activity.isLoading}
          error={activity.error}
          onRetry={() => activity.refetch()}
          timezone={timezone}
        />
      </section>
    </>
  );
}

function SyncButton({ timezone }: { timezone: string }) {
  const qc = useQueryClient();
  const status = useQuery(connectionStatusQuery());
  const sync = useServerFn(syncGithub);
  const [result, setResult] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      const res = await sync({ data: {} });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onMutate: () => setResult(null),
    onSuccess: (res) => {
      setResult(formatSyncCounts(res.counts));
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["activity-range"] });
      qc.invalidateQueries({ queryKey: ["connection-status"] });
    },
  });

  if (status.isLoading) return null;
  if (!status.data?.connected) {
    return (
      <Link to="/settings" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Connect GitHub to sync
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="cta" onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {m.isPending ? "Syncing GitHub" : "Sync GitHub"}
      </Button>
      <p className="max-w-xs text-right text-xs text-muted-foreground" aria-live="polite">
        {m.isPending
          ? "Fetching the last 7 days. This can take a minute."
          : m.error
            ? <span className="text-destructive">{m.error.message}</span>
            : result
              ? result
              : status.data.lastSyncedAt
                ? `Last synced ${formatDateTimeInTz(status.data.lastSyncedAt, timezone)}`
                : "Not synced yet"}
      </p>
    </div>
  );
}
