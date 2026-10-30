// Pure date helpers. Dates are "YYYY-MM-DD" strings in the user's timezone.
// Timestamps are stored in UTC; grouping into days always goes through dateInTz.

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export type WeekStart = "monday" | "sunday";

export function dateInTz(instant: Date | string, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayInTz(timeZone: string, now: Date = new Date()): string {
  return dateInTz(now, timeZone);
}

/** Hour of day (0 to 23) at this instant in the given timezone. */
export function hourInTz(now: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(h) % 24;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  // a - b in whole days
  const ms = new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function startOfWeek(date: string, weekStartsOn: WeekStart): string {
  const dow = weekdayOf(date);
  const startDow = weekStartsOn === "monday" ? 1 : 0;
  const back = (dow - startDow + 7) % 7;
  return addDays(date, -back);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export type PeriodPreset =
  | "yesterday"
  | "today"
  | "this_week"
  | "last_week"
  | "this_month"
  | "all_time"
  | "custom";

export function presetRange(
  preset: Exclude<PeriodPreset, "custom">,
  today: string,
  weekStartsOn: WeekStart,
): { start: string; end: string } {
  switch (preset) {
    case "yesterday": {
      const y = addDays(today, -1);
      return { start: y, end: y };
    }
    case "today":
      return { start: today, end: today };
    case "this_week": {
      const s = startOfWeek(today, weekStartsOn);
      return { start: s, end: addDays(s, 6) };
    }
    case "last_week": {
      const s = addDays(startOfWeek(today, weekStartsOn), -7);
      return { start: s, end: addDays(s, 6) };
    }
    case "this_month":
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case "all_time":
      return { start: "2000-01-01", end: today };
  }
}

/** Human date label, e.g. "Monday, 26 October 2026". Format in UTC so the string date is not shifted. */
export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatMonth(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatTimeInTz(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(instant));
}

export function formatDateTimeInTz(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(instant));
}

export function listTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return zones.length ? zones : [DEFAULT_TIMEZONE, "UTC"];
}

export function formatWeekday(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatDayMonth(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
