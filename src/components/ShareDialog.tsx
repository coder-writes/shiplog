import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createShareLink } from "@/lib/share.functions";
import { reportSharesQuery } from "@/lib/queries";
import { SHARE_DURATIONS, type ShareDays } from "@/lib/share-token";
import { formatDateTimeInTz } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const DAY_LABEL: Record<ShareDays, string> = { 1: "1 day", 7: "7 days", 30: "30 days" };

export function ShareDialog({ reportId, timezone }: { reportId: string; timezone: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<ShareDays>(7);
  const [url, setUrl] = useState<string | null>(null);
  const create = useServerFn(createShareLink);
  const shares = useQuery({ ...reportSharesQuery(reportId), enabled: open });

  const createM = useMutation({
    mutationFn: async () => {
      const res = await create({ data: { reportId, days } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onMutate: () => setUrl(null),
    onSuccess: (res) => {
      setUrl(`${window.location.origin}/share/${res.token}`);
      qc.invalidateQueries({ queryKey: ["report-shares", reportId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-shares", reportId] });
      toast.success("Link turned off.");
    },
    onError: () => toast.error("Could not turn the link off."),
  });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setUrl(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Link2 /> Share link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Share this report</DialogTitle>
          <DialogDescription>
            Anyone with the link can read this one report, without signing in, until it expires.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Link works for</p>
            <div className="flex gap-1.5">
              {SHARE_DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    days === d ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {DAY_LABEL[d]}
                </button>
              ))}
            </div>
          </div>
          <Button variant="cta" onClick={() => createM.mutate()} disabled={createM.isPending}>
            {createM.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
            Create link
          </Button>
          {url && (
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" onClick={copy}>
                <Copy /> Copy
              </Button>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-medium text-foreground">Links for this report</p>
            {shares.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading</p>
            ) : (shares.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="space-y-2">
                {(shares.data ?? []).map((s) => {
                  const expired = new Date(s.expires_at).getTime() <= Date.now();
                  const state = s.revoked_at ? "Off" : expired ? "Expired" : "Active";
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        <span className={state === "Active" ? "text-success" : ""}>{state}</span>
                        {" · "}expires {formatDateTimeInTz(s.expires_at, timezone)}
                      </span>
                      {state === "Active" && (
                        <Button size="sm" variant="ghost" onClick={() => revokeM.mutate(s.id)} disabled={revokeM.isPending}>
                          Turn off
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
