// Pure helpers for Google Calendar meetings. Safe in browser and server.
import { dateInTz, formatTimeInTz } from "./dates";

export type Meeting = { id: string; title: string; date: string; startAt: string; endAt: string; minutes: number };

export type RawCalendarEvent = {
  id?: string;
  summary?: string;
  status?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

const SKIP_TYPES = new Set(["outOfOffice", "focusTime", "workingLocation", "birthday"]);

/**
 * Keep timed meetings on local days start..end that were not cancelled or declined.
 * All-day entries, out of office, focus time and working location blocks are skipped.
 */
export function toMeetings(events: RawCalendarEvent[], timezone: string, start: string, end: string): Meeting[] {
  const out: Meeting[] = [];
  for (const e of events) {
    if (!e.id || e.status === "cancelled") continue;
    if (e.eventType && SKIP_TYPES.has(e.eventType)) continue;
    const s = e.start?.dateTime;
    const f = e.end?.dateTime;
    if (!s || !f) continue;
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    const date = dateInTz(s, timezone);
    if (date < start || date > end) continue;
    const minutes = Math.max(0, Math.round((new Date(f).getTime() - new Date(s).getTime()) / 60000));
    out.push({
      id: e.id,
      title: (e.summary?.trim() || "Untitled meeting").slice(0, 200),
      date,
      startAt: s,
      endAt: f,
      minutes,
    });
  }
  return out.sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Standup lines, assembled in code from calendar data. */
export function meetingsToMarkdown(meetings: Meeting[], timezone: string): string {
  if (!meetings.length) return "- None";
  return meetings
    .map((m) => `- ${formatTimeInTz(m.startAt, timezone)} ${m.title.replace(/[\r\n]+/g, " ")} (${formatMinutes(m.minutes)})`)
    .join("\n");
}
