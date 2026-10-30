import { ExternalLink } from "lucide-react";
import { ACTIVITY_LABELS, ACTIVITY_TYPES, type ActivityType } from "@/lib/constants";
import { formatTimeInTz } from "@/lib/dates";
import type { Activity } from "@/lib/queries";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";

export function ActivityPanel({
  activity,
  isLoading,
  error,
  onRetry,
  timezone,
}: {
  activity: Activity[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  timezone: string;
}) {
  if (isLoading) return <LoadingState label="Loading GitHub activity" />;
  if (error) return <ErrorState message="Could not load GitHub activity." onRetry={onRetry} />;
  if (!activity?.length) return <EmptyState title="No GitHub activity found for this day." />;

  const groups = ACTIVITY_TYPES.map((t) => ({ type: t, rows: activity.filter((a) => a.type === t) })).filter(
    (g) => g.rows.length,
  );

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.type}>
          <p className="eyebrow mb-2">
            {ACTIVITY_LABELS[g.type as ActivityType]} <span className="ml-1 text-foreground/60">{g.rows.length}</span>
          </p>
          <ul className="divide-y rounded-xl border bg-card">
            {g.rows.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.title || "(untitled)"}</p>
                  {a.body_excerpt && g.type !== "commit" && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{a.body_excerpt}</p>
                  )}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span className="font-mono">{a.repo}</span>
                    <span>{formatTimeInTz(a.occurred_at, timezone)}</span>
                    {a.state && <span>{a.state.replace(/_/g, " ")}</span>}
                    {a.additions != null && (
                      <span>
                        +{a.additions} / -{a.deletions ?? 0}
                      </span>
                    )}
                  </p>
                </div>
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Open on GitHub"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
