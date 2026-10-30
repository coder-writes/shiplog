import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isIsoDate } from "./dates";

const isoDate = z.string().refine(isIsoDate, "Use a YYYY-MM-DD date");

export const calendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionForUser } = await import("./appUserConnections.server");
    const conn = await getConnectionForUser(context.userId, "google_calendar");
    return { connected: !!conn, reconnectRequired: !!conn?.reconnectRequired };
  });

export const startCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { buildAuthUrl } = await import("./calendar.server");
    const request = getRequest();
    const origin = request ? new URL(request.url).origin : (process.env["VITE_APP_URL"] || "http://localhost:8080");
    const redirectUri = `${origin}/api/oauth/google-calendar/return`;
    return { authorizationUrl: buildAuthUrl(redirectUri) };
  });

export const completeCalendarConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { exchangeCodeForTokens } = await import("./calendar.server");
    const { saveConnectionKeyForUser } = await import("./appUserConnections.server");
    const request = getRequest();
    const origin = request ? new URL(request.url).origin : (process.env["VITE_APP_URL"] || "http://localhost:8080");
    const redirectUri = `${origin}/api/oauth/google-calendar/return`;
    const tokens = await exchangeCodeForTokens(data.code, redirectUri);
    await saveConnectionKeyForUser(context.userId, "google_calendar", JSON.stringify(tokens));
    return { ok: true };
  });

export const disconnectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteConnectionForUser } = await import("./appUserConnections.server");
    await deleteConnectionForUser(context.userId, "google_calendar");
    return { ok: true as const };
  });

/** Meetings for a range of local days, for the Log page. */
export const getMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ start: isoDate, end: isoDate }).refine((v) => v.start <= v.end).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase.from("profiles").select("timezone").eq("id", context.userId).maybeSingle();
    const { fetchMeetings } = await import("./calendar.server");
    return fetchMeetings(context.userId, data.start, data.end, profile?.timezone || "Asia/Kolkata");
  });
