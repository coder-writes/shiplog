// Server-only: Google Calendar via direct OAuth2.
// Tokens (access + refresh) are stored encrypted in app_user_connections.
import { addDays } from "./dates";
import { toMeetings, type Meeting, type RawCalendarEvent } from "./meetings";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export type MeetingsResult =
  | { status: "not_connected" }
  | { status: "reconnect" }
  | { status: "error"; error: string }
  | { status: "ok"; meetings: Meeting[] };

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

function clientCreds() {
  const id = process.env["GOOGLE_CLIENT_ID"];
  const secret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set.");
  return { id, secret };
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: number }> {
  const { id, secret } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    access_token: json.access_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
  };
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<StoredTokens> {
  const { id, secret } = clientCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Code exchange failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  if (!json.refresh_token) throw new Error("Google did not return a refresh_token. Make sure access_type=offline and prompt=consent.");
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
  };
}

export function buildAuthUrl(redirectUri: string): string {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/auth?${params}`;
}

/** Meetings on local days start..end. UTC window widened by a day, filtered by local day. */
export async function fetchMeetings(
  userId: string,
  start: string,
  end: string,
  timezone: string,
): Promise<MeetingsResult> {
  const { getConnectionForUser, saveConnectionKeyForUser } = await import("./appUserConnections.server");

  const conn = await getConnectionForUser(userId, "google_calendar");
  if (!conn) return { status: "not_connected" };
  if (conn.reconnectRequired) return { status: "reconnect" };

  let tokens: StoredTokens;
  try {
    tokens = JSON.parse(conn.key) as StoredTokens;
  } catch {
    return { status: "reconnect" };
  }

  // Refresh access token if expired
  if (Date.now() >= tokens.expires_at) {
    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      tokens = { ...tokens, ...refreshed };
      await saveConnectionKeyForUser(userId, "google_calendar", JSON.stringify(tokens));
    } catch (e) {
      console.error("Calendar token refresh failed:", e instanceof Error ? e.message : "unknown");
      return { status: "reconnect" };
    }
  }

  const params = new URLSearchParams({
    timeMin: `${addDays(start, -1)}T00:00:00Z`,
    timeMax: `${addDays(end, 2)}T00:00:00Z`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    fields: "items(id,summary,status,eventType,start,end,attendees(self,responseStatus))",
  });

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (res.status === 401) return { status: "reconnect" };
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Calendar request failed [${res.status}]: ${body.slice(0, 500)}`);
    return { status: "error", error: `Google Calendar could not be read (status ${res.status}).` };
  }

  const json = (await res.json()) as { items?: RawCalendarEvent[] };
  return { status: "ok", meetings: toMeetings(json.items ?? [], timezone, start, end) };
}
