import type { Stats } from "@/lib/stats";

export function StatCards({ stats }: { stats: Stats }) {
  const cards: { label: string; value: string }[] = [
    { label: "Commits", value: String(stats.commits) },
    { label: "PRs opened", value: String(stats.prsOpened) },
    { label: "PRs merged", value: String(stats.prsMerged) },
    { label: "Issues opened", value: String(stats.issuesOpened) },
    { label: "Comments", value: String(stats.comments) },
    { label: "Reviews", value: String(stats.reviews) },
    { label: "Repos touched", value: String(stats.reposTouched) },
    { label: "Lines", value: `+${stats.linesAdded} / -${stats.linesRemoved}` },
    { label: "Days in a row", value: String(stats.streak) },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border bg-card px-3 py-2.5">
          <div className={`font-display leading-none text-foreground ${c.value.length > 5 ? "whitespace-nowrap text-base" : "text-2xl"}`}>{c.value}</div>
          <div className="mt-1.5 text-[11px] leading-tight text-muted-foreground">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
