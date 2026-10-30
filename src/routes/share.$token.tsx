import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSharedReport } from "@/lib/share.functions";
import { formatShortDate } from "@/lib/dates";
import { Logo } from "@/components/Logo";

// Public read-only page. Anyone with the signed link can read this one report until it expires.
export const Route = createFileRoute("/share/$token")({
  loader: ({ params }) => getSharedReport({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Shared report | ShipLog" },
      { name: "description", content: "A read-only work report shared from ShipLog." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Shared report | ShipLog" },
      { property: "og:description", content: "A read-only work report shared from ShipLog." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SharedReportPage,
  errorComponent: () => <Unavailable message="This link could not be opened." />,
});

const TYPE_LABEL: Record<string, string> = { standup: "Standup", weekly: "Weekly summary", brag: "Brag document" };

function Unavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <Logo />
      <h1 className="font-display mt-8 text-4xl text-foreground">
        Link <em className="italic">unavailable.</em>
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">{message}</p>
    </div>
  );
}

function SharedReportPage() {
  const res = Route.useLoaderData();
  if (!res.ok) {
    const message =
      res.reason === "expired"
        ? "This link has expired. Ask the person who shared it for a new one."
        : res.reason === "revoked"
          ? "The person who shared this report turned the link off."
          : "This link is not valid.";
    return <Unavailable message={message} />;
  }
  const { report, expiresAt } = res;
  const period =
    report.period_start === report.period_end
      ? formatShortDate(report.period_start)
      : `${formatShortDate(report.period_start)} to ${formatShortDate(report.period_end)}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Logo />
          <p className="text-xs text-muted-foreground">
            Read-only. Link expires {new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
          </p>
        </header>
        <p className="eyebrow mt-12">{TYPE_LABEL[report.type] ?? "Report"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{period}</p>
        <article className="prose-shiplog mt-6 rounded-2xl border bg-card px-6 py-6 text-[15px] text-foreground sm:px-8">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
