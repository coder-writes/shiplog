// Pure helpers for the weekly report email (safe in browser and server).
import { addDays, formatShortDate, presetRange, startOfWeek, type WeekStart } from "./dates";

/** Local send hour on the first day of a new week. */
export const WEEKLY_EMAIL_HOUR = 9;

/**
 * Which finished week (if any) should be emailed now.
 * Sends only on the first day of the user's week, from 9 am local time,
 * and never twice for the same week.
 */
export function weeklyEmailDue(opts: {
  today: string;
  localHour: number;
  weekStart: WeekStart;
  lastSentPeriod: string | null;
}): { start: string; end: string } | null {
  if (startOfWeek(opts.today, opts.weekStart) !== opts.today) return null;
  if (opts.localHour < WEEKLY_EMAIL_HOUR) return null;
  const period = presetRange("last_week", opts.today, opts.weekStart);
  if (opts.lastSentPeriod && opts.lastSentPeriod >= period.start) return null;
  return period;
}

export function weeklyEmailSubject(start: string, end: string): string {
  return `Your ShipLog week: ${formatShortDate(start)} to ${formatShortDate(end)}`;
}

/** Last completed week for a manual "send now". */
export function lastCompletedWeek(today: string, weekStart: WeekStart) {
  const s = addDays(startOfWeek(today, weekStart), -7);
  return { start: s, end: addDays(s, 6) };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code style="font-family:monospace;background:#f1eee6;padding:1px 4px;border-radius:4px">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,])/g, "$1<em>$2</em>");
}

/** Convert the plain markdown ShipLog generates into simple email HTML. */
export function markdownToEmailHtml(md: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul style="margin:0 0 16px;padding-left:20px">${list.join("")}</ul>`);
    list = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const b = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (b) {
      list.push(`<li style="margin:0 0 6px">${inline(b[1] ?? "")}</li>`);
      continue;
    }
    flush();
    if (h) {
      const level = (h[1] ?? "#").length;
      const size = level === 1 ? 26 : 18;
      const font = level === 1 ? "Georgia,serif" : "Arial,sans-serif";
      out.push(`<h${Math.min(level, 3)} style="font-family:${font};font-size:${size}px;font-weight:${level === 1 ? 400 : 600};margin:24px 0 10px;color:#1f2a24">${inline(h[2] ?? "")}</h${Math.min(level, 3)}>`);
    } else if (line.trim()) {
      out.push(`<p style="margin:0 0 16px">${inline(line)}</p>`);
    }
  }
  flush();
  return `<!doctype html><html><body style="margin:0;background:#ffffff"><div style="max-width:600px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#2b2b2b">${out.join("")}<p style="margin:32px 0 0;font-size:12px;color:#8a8a8a">Sent by ShipLog. Turn this off any time in Settings.</p></div></body></html>`;
}
