// Server-only: send email via Resend.
export class GmailError extends Error {}

export async function sendGmail(opts: { to: string; subject: string; text: string; html: string }) {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"] || "onboarding@resend.dev";
  if (!apiKey) throw new GmailError("RESEND_API_KEY is not set.");
  if (/[\r\n]/.test(opts.to)) throw new GmailError("Invalid email address.");

  const sendRequest = async (targetEmail: string) => {
    return fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [targetEmail],
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    });
  };

  const recipient = process.env["RESEND_TEST_RECIPIENT_EMAIL"] || opts.to;
  let res = await sendRequest(recipient);

  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend send failed [${res.status}]: ${body.slice(0, 500)}`);

    // Resend free tier restricts onboarding@resend.dev to the account owner email:
    const match = body.match(/only send testing emails to your own email address \(([^)]+)\)/i);
    if (match?.[1] && match[1] !== recipient) {
      console.log(`Resend restricted recipient; retrying with account owner: ${match[1]}`);
      res = await sendRequest(match[1]);
      if (res.ok) return;
    }

    let errorMsg = `Email could not be sent (status ${res.status}).`;
    try {
      const json = JSON.parse(body);
      if (json.message) errorMsg = json.message;
    } catch {
      /* ignore */
    }
    throw new GmailError(errorMsg);
  }
}
