import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { entriesListQuery } from "@/lib/queries";
import { formatShortDate } from "@/lib/dates";
import { ErrorState, LoadingState } from "@/components/States";

export function EntryList({ selected }: { selected: string }) {
  const { data, isLoading, error, refetch } = useQuery(entriesListQuery());
  const entries = (data ?? []).filter((e) => e.raw_note.trim());

  return (
    <aside>
      <p className="eyebrow mb-3">Past entries</p>
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Could not load entries." onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries yet. Your first note will show up here.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => {
            const active = e.entry_date === selected;
            return (
              <li key={e.id}>
                <Link
                  to="/log"
                  search={{ date: e.entry_date }}
                  className={`block rounded-lg px-3 py-2 transition-colors ${
                    active ? "bg-card ring-1 ring-border" : "hover:bg-accent"
                  }`}
                >
                  <span className="block text-xs font-medium text-muted-foreground">{formatShortDate(e.entry_date)}</span>
                  <span className="mt-0.5 block truncate text-sm text-foreground">{e.raw_note.trim().split("\n")[0]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
