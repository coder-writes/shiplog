import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, Loader2, Pencil, Sparkles, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateEntry } from "@/lib/ai.functions";
import { ACTIVITY_SHORT, CATEGORIES, CATEGORY_LABELS, IMPACT_PROMPT, type ActivityType, type Category } from "@/lib/constants";
import { itemsQuery, type Activity, type Item } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, SectionTitle } from "@/components/States";

export function ItemsReview({ date, activity }: { date: string; activity: Activity[] }) {
  const qc = useQueryClient();
  const { data: items, isLoading, error, refetch } = useQuery(itemsQuery(date));
  const generate = useServerFn(generateEntry);
  const [genError, setGenError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["items", date] });

  const gen = useMutation({
    mutationFn: async () => {
      const res = await generate({ data: { entry_date: date } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onMutate: () => setGenError(null),
    onSuccess: (res) => {
      invalidate();
      toast.success(
        res.created
          ? `Generated ${res.created} item${res.created === 1 ? "" : "s"}${res.dropped ? `, dropped ${res.dropped} without evidence` : ""}.`
          : "No grounded items found for this day.",
      );
    },
    onError: (e: Error) => setGenError(e.message),
  });

  const approveAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("items").update({ status: "approved" }).eq("item_date", date).eq("status", "pending");
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: () => toast.error("Could not approve items."),
  });

  const pendingCount = items?.filter((i) => i.status === "pending").length ?? 0;
  const byId = new Map(activity.map((a) => [a.id, a]));

  return (
    <section>
      <SectionTitle
        eyebrow="Review"
        title={<>Work <em className="italic">items</em></>}
        action={
          <>
            {pendingCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => approveAll.mutate()} disabled={approveAll.isPending}>
                {approveAll.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                Approve all
              </Button>
            )}
            <Button variant="cta" size="sm" onClick={() => gen.mutate()} disabled={gen.isPending}>
              {gen.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {gen.isPending ? "Generating" : "Generate items"}
            </Button>
          </>
        }
      />
      {genError && (
        <div className="mb-4">
          <ErrorState message={genError} onRetry={() => gen.mutate()} />
        </div>
      )}
      {isLoading ? (
        <LoadingState label="Loading items" />
      ) : error ? (
        <ErrorState message="Could not load items." onRetry={() => refetch()} />
      ) : !items?.length ? (
        <EmptyState title="No items yet for this day.">
          Save your note, sync GitHub, then press Generate items.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const rows = items.filter((i) => i.category === cat);
            if (!rows.length) return null;
            return (
              <div key={cat}>
                <p className="eyebrow mb-2">{CATEGORY_LABELS[cat]}</p>
                <div className="space-y-2">
                  {rows.map((item) => (
                    <ItemCard key={item.id} item={item} byId={byId} onChanged={invalidate} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItemCard({ item, byId, onChanged }: { item: Item; byId: Map<string, Activity>; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [category, setCategory] = useState<Category>(item.category as Category);
  const [impact, setImpact] = useState("");

  const update = useMutation({
    mutationFn: async (patch: Partial<Pick<Item, "status" | "text" | "category" | "impact_note">>) => {
      const { error } = await supabase.from("items").update(patch).eq("id", item.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
    onError: () => toast.error("Could not update the item."),
  });

  const rejected = item.status === "rejected";
  const approved = item.status === "approved";
  const linked = item.source_activity_ids.map((id) => byId.get(id)).filter((a): a is Activity => !!a);
  const needsImpact = approved && (item.category === "shipped" || item.category === "fixed") && !item.impact_note;

  return (
    <div className={`rounded-xl border bg-card px-4 py-3.5 ${rejected ? "opacity-55" : ""} ${approved ? "border-success/40" : ""}`}>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="autogrow block min-h-[60px] w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
              aria-label="Category"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => update.mutate({ text: text.trim(), category })} disabled={!text.trim() || update.isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(item.text); setCategory(item.category as Category); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <p className={`flex-1 text-[15px] leading-relaxed text-foreground ${rejected ? "line-through" : ""}`}>{item.text}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                approved ? "bg-success/15 text-success" : rejected ? "bg-muted text-muted-foreground" : "bg-lavender text-lavender-foreground"
              }`}
            >
              {item.status}
            </span>
          </div>
          {item.impact_note && <p className="mt-1 text-sm text-muted-foreground">Impact: {item.impact_note}</p>}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {item.from_note && (
              <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">from note</span>
            )}
            {linked.map((a) => (
              <a
                key={a.id}
                href={a.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                title={a.title}
                className="inline-flex max-w-[260px] items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <span className="font-medium">{ACTIVITY_SHORT[a.type as ActivityType]}</span>
                <span className="truncate">{a.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {!approved && (
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ status: "approved" })} disabled={update.isPending}>
                <Check /> Approve
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            {rejected || approved ? (
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ status: "pending" })} disabled={update.isPending}>
                <Undo2 /> Undo
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ status: "rejected" })} disabled={update.isPending}>
                <X /> Reject
              </Button>
            )}
          </div>
          {needsImpact && (
            <div className="mt-3 rounded-lg bg-muted px-3 py-2.5">
              <label htmlFor={`impact-${item.id}`} className="text-sm text-muted-foreground">
                {IMPACT_PROMPT}
              </label>
              <div className="mt-2 flex gap-2">
                <textarea
                  id={`impact-${item.id}`}
                  rows={1}
                  value={impact}
                  onChange={(e) => setImpact(e.target.value)}
                  className="autogrow block min-h-[36px] flex-1 resize-none rounded-md border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <Button size="sm" variant="outline" disabled={!impact.trim() || update.isPending} onClick={() => update.mutate({ impact_note: impact.trim() })}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
