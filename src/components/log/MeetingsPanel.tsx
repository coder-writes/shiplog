import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMeetings } from "@/lib/calendar.functions";
import { formatTimeInTz } from "@/lib/dates";
import { formatMinutes } from "@/lib/meetings";
import { useCalendarStatus } from "@/components/CalendarCard";
import { ErrorState, LoadingState, SectionTitle } from "@/components/States";

export function MeetingsPanel({ date, timezone }: { date: string; timezone: string }) {
  const status = useCalendarStatus();
  const fetchMeetings = useServerFn(getMeetings);
  const connected = !!status.data?.connected;
  const meetings = useQuery({
    queryKey: ["meetings", date],
    queryFn: () => fetchMeetings({ data: { start: date, end: date } }),
    enabled: connected,
  });

  // Optional feature: stay out of the way until it is connected.
  if (status.isLoading || !connected) return null;

  const res = meetings.data;
  const total = res?.status === "ok" ? res.meetings.reduce((s, m) => s + m.minutes, 0) : 0;

  return (
    <section>
      <SectionTitle eyebrow="Calendar" title={<>Meetings <em className="italic">this day</em></>} />
      {meetings.isLoading ? (
        <LoadingState label="Loading meetings" />
      ) : meetings.error || res?.status === "error" ? (
        <ErrorState message={res?.status === "error" ? res.error : "Could not load meetings."} onRetry={() => meetings.refetch()} />
      ) : res?.status === "reconnect" ? (
        <p className="text-sm text-muted-foreground">
          Your Google Calendar access needs to be renewed.{" "}
          <Link to="/settings" className="underline underline-offset-4 hover:text-foreground">Reconnect in Settings</Link>
        </p>
      ) : res?.status === "ok" && res.meetings.length ? (
        <div className="rounded-2xl border bg-card">
          <ul className="divide-y">
            {res.meetings.map((m) => (
              <li key={m.id} className="flex items-baseline gap-4 px-5 py-3 text-sm">
                <span className="w-14 shrink-0 tabular-nums text-muted-foreground">{formatTimeInTz(m.startAt, timezone)}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{m.title}</span>
                <span className="shrink-0 text-muted-foreground">{formatMinutes(m.minutes)}</span>
              </li>
            ))}
          </ul>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {res.meetings.length} {res.meetings.length === 1 ? "meeting" : "meetings"}, {formatMinutes(total)} in total. Included in your standup.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No meetings on this day.</p>
      )}
    </section>
  );
}
