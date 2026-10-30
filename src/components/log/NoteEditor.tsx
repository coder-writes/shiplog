import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { entryQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/States";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Plain textarea for dictation tools: no key handlers, no input debounce.
 * Only the save is delayed (2s after the last change); every keystroke lands in state immediately.
 */
export function NoteEditor({ date, userId }: { date: string; userId: string }) {
  const qc = useQueryClient();
  const { data: entry, isLoading, error, refetch } = useQuery(entryQuery(date));
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const loaded = useRef(false);
  const valueRef = useRef("");
  const savedRef = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Some dictation tools write into the box without firing an input event.
  // Read the box itself so that text is never missed.
  function pullFromBox(): boolean {
    const dom = textareaRef.current?.value;
    if (dom === undefined || dom === valueRef.current) return false;
    valueRef.current = dom;
    setValue(dom);
    return true;
  }

  useEffect(() => {
    if (isLoading || loaded.current || error) return;
    const initial = entry?.raw_note ?? "";
    loaded.current = true;
    valueRef.current = initial;
    savedRef.current = initial;
    setValue(initial);
  }, [isLoading, entry, error]);

  async function save() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (saving.current) return;
    pullFromBox();
    const text = valueRef.current;
    if (text === savedRef.current) {
      setSaveError(null);
      setStatus("saved");
      return;
    }
    saving.current = true;
    setStatus("saving");
    const { data, error } = await supabase
      .from("daily_entries")
      .upsert({ user_id: userId, entry_date: date, raw_note: text }, { onConflict: "user_id,entry_date" })
      .select("*")
      .single();
    saving.current = false;
    if (error) {
      setStatus("error");
      setSaveError("Could not save. Your text is still here; try again.");
      return;
    }
    savedRef.current = text;
    setSaveError(null);
    qc.setQueryData(entryQuery(date).queryKey, data);
    qc.invalidateQueries({ queryKey: ["entries"] });
    qc.invalidateQueries({ queryKey: ["logged-dates"] });
    if (valueRef.current !== text) {
      setStatus("dirty");
      schedule();
    } else setStatus("saved");
  }

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 2000);
  }

  // Pick up dictated text that arrived without an input event, then autosave it.
  useEffect(() => {
    const id = setInterval(() => {
      if (!loaded.current) return;
      if (pullFromBox()) {
        setStatus("dirty");
        schedule();
      }
    }, 1500);
    return () => clearInterval(id);
  }, []);

  // Flush any pending save when switching days or leaving the page.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    return () => {
      const pending = timer.current || (textareaRef.current && textareaRef.current.value !== valueRef.current);
      if (timer.current) clearTimeout(timer.current);
      if (pending) void saveRef.current();
    };
  }, []);

  if (isLoading) return <LoadingState label="Loading note" />;
  if (error) return <ErrorState message="Could not load this day's note." onRetry={() => refetch()} />;

  return (
    <div>
      <label htmlFor="daily-note" className="mb-3 block text-base font-medium text-foreground">
        What did you work on today? What are you doing next?
      </label>
      <textarea
        id="daily-note"
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          valueRef.current = e.target.value;
          setValue(e.target.value);
          setStatus("dirty");
          schedule();
        }}
        placeholder="Speak or type. Mention what you shipped, fixed, reviewed, learned, any blockers, and what's next."
        className="autogrow block min-h-[220px] w-full resize-none rounded-2xl border bg-card px-5 py-4 text-[17px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button variant="cta" onClick={() => void save()} disabled={status === "saving"}>
          {status === "saving" && <Loader2 className="animate-spin" />}
          Save
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {status === "saving" && "Saving"}
          {status === "saved" && (
            <span className="inline-flex items-center gap-1 text-success">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {status === "dirty" && "Unsaved changes"}
        </span>
      </div>
      {saveError && (
        <div className="mt-3">
          <ErrorState message={saveError} onRetry={() => void save()} />
        </div>
      )}
    </div>
  );
}
