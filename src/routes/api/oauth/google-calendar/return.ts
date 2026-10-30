// OAuth callback: Google redirects here with ?code=... after the user authorizes.
// We pass it to the opener window which calls completeCalendarConnection server fn.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/google-calendar/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? "";
        const error = url.searchParams.get("error") ?? "";

        const result = code
          ? { success: true, code }
          : { success: false, error: error || "OAuth failed" };

        const escapeHtml = (str: string) =>
          str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const safeJson = JSON.stringify(result).replace(/<\//g, "<\\/");

        const html = `<!DOCTYPE html>
<html>
<head><title>Finishing connection</title><meta name="robots" content="noindex"></head>
<body style="font-family:sans-serif;padding:24px">
  <p>${result.success ? "Connected. Closing this window." : "Failed: " + escapeHtml(error)}</p>
  <script>
    const result = ${safeJson};
    const message = result.success
      ? { type: "googleCalendarOAuthComplete", code: result.code }
      : { type: "googleCalendarOAuthFailed", error: result.error };
    if (window.opener && window.opener !== window) {
      window.opener.postMessage(message, window.location.origin);
    }
    window.close();
  <\/script>
</body>
</html>`;
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      },
    },
  },
});
