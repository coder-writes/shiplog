import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { disconnectGithub, saveGithubConnection } from "@/lib/github.functions";
import { clearDemoData, loadDemoData } from "@/lib/demo.functions";
import { sendWeeklyReportNow } from "@/lib/weekly-email.functions";
import { WEEKLY_EMAIL_HOUR } from "@/lib/weekly-email";
import { connectionStatusQuery, profileQuery } from "@/lib/queries";
import { addDays, formatDateTimeInTz, formatShortDate, listTimezones } from "@/lib/dates";
import { TOKEN_HELP_TEXT } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorState, LoadingState } from "@/components/States";
import { CalendarCard } from "@/components/CalendarCard";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings | ShipLog" },
      { name: "description", content: "Connect GitHub, set your timezone and week start, and get your weekly report by email." },
      { property: "og:title", content: "Settings | ShipLog" },
      { property: "og:description", content: "Connect GitHub, set your timezone and week start, and get your weekly report by email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function Card({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6 sm:p-8">
      <h2 className="font-display text-2xl text-foreground">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="eyebrow">Settings</p>
        <h1 className="font-display mt-2 text-5xl text-foreground">
          Make it <em className="italic">yours.</em>
        </h1>
      </div>
      <GithubCard />
      <CalendarCard Card={Card} />
      <PreferencesCard />
      <WeeklyEmailCard />
      <DemoCard />
    </div>
  );
}

function GithubCard() {
  const qc = useQueryClient();
  const status = useQuery(connectionStatusQuery());
  const profile = useQuery(profileQuery());
  const save = useServerFn(saveGithubConnection);
  const disconnect = useServerFn(disconnectGithub);
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveM = useMutation({
    mutationFn: async () => {
      const res = await save({ data: { githubUsername: username, token } });
      if (!res.ok) throw new Error(res.error);
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      setToken("");
      qc.invalidateQueries({ queryKey: ["connection-status"] });
      toast.success("GitHub connected.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const disconnectM = useMutation({
    mutationFn: async () => {
      const res = await disconnect();
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connection-status"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    saveM.mutate();
  }

  return (
    <Card title="GitHub" description={TOKEN_HELP_TEXT}>
      {status.isLoading ? (
        <LoadingState />
      ) : status.error ? (
        <ErrorState message="Could not check your GitHub connection." onRetry={() => status.refetch()} />
      ) : status.data?.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="h-5 w-5" /> Connected
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              As {status.data.githubUsername}.{" "}
              {status.data.lastSyncedAt
                ? `Last synced ${formatDateTimeInTz(status.data.lastSyncedAt, profile.data?.timezone ?? "Asia/Kolkata")}.`
                : "Not synced yet."}
            </p>
          </div>
          <Button variant="outline" onClick={() => disconnectM.mutate()} disabled={disconnectM.isPending}>
            {disconnectM.isPending && <Loader2 className="animate-spin" />}
            Disconnect
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gh-user">GitHub username</Label>
            <Input id="gh-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gh-token">Personal access token</Label>
            <Input
              id="gh-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="new-password"
              placeholder="github_pat_..."
              required
            />
            <p className="text-xs text-muted-foreground">Stored encrypted on the server. It is never shown again.</p>
          </div>
          {error && <ErrorState message={error} />}
          <Button type="submit" variant="cta" disabled={saveM.isPending}>
            {saveM.isPending && <Loader2 className="animate-spin" />}
            Save connection
          </Button>
        </form>
      )}
    </Card>
  );
}

function PreferencesCard() {
  const qc = useQueryClient();
  const profile = useQuery(profileQuery());
  const [zones] = useState(() => listTimezones());

  const update = useMutation({
    mutationFn: async (patch: { timezone?: string; week_starts_on?: string }) => {
      const id = profile.data?.id;
      if (!id) throw new Error("No profile");
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Saved.");
    },
    onError: () => toast.error("Could not save preferences."),
  });

  const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

  return (
    <Card title="Preferences" description="Activity is grouped into days using your timezone.">
      {profile.isLoading ? (
        <LoadingState />
      ) : profile.error || !profile.data ? (
        <ErrorState message="Could not load preferences." onRetry={() => profile.refetch()} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tz">Timezone</Label>
            <select id="tz" className={selectClass} value={profile.data.timezone} onChange={(e) => update.mutate({ timezone: e.target.value })}>
              {(zones.includes(profile.data.timezone) ? zones : [profile.data.timezone, ...zones]).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws">Week starts on</Label>
            <select id="ws" className={selectClass} value={profile.data.week_starts_on} onChange={(e) => update.mutate({ week_starts_on: e.target.value })}>
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>
        </div>
      )}
    </Card>
  );
}

function WeeklyEmailCard() {
  const qc = useQueryClient();
  const profile = useQuery(profileQuery());
  const [email, setEmail] = useState<string | null>(null);
  const sendNow = useServerFn(sendWeeklyReportNow);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const id = profile.data?.id;
      if (!id) throw new Error("No profile");
      const { error } = await supabase.from("profiles").update({ weekly_email_enabled: enabled }).eq("id", id);
      if (error) throw new Error(error.message);
      return enabled;
    },
    onSuccess: (enabled) => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(enabled ? "Weekly email turned on." : "Weekly email turned off.");
    },
    onError: () => toast.error("Could not save this setting."),
  });

  const send = useMutation({
    mutationFn: async () => {
      const res = await sendNow();
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success(`Sent last week's report to ${res.email}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const day = profile.data?.week_starts_on === "sunday" ? "Sunday" : "Monday";
  const last = profile.data?.weekly_email_last_period;

  return (
    <Card title="Weekly email" description="Optional. Get last week's report in your inbox, built from the items you approved.">
      {profile.isLoading ? (
        <LoadingState />
      ) : profile.error || !profile.data ? (
        <ErrorState message="Could not load this setting." onRetry={() => profile.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="weekly-email" className="text-base">Email me my weekly report</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Every {day} at {WEEKLY_EMAIL_HOUR} am your time{email ? <>, sent to <span className="text-foreground">{email}</span></> : null}.
                Weeks with no approved items are skipped.
              </p>
            </div>
            <Switch
              id="weekly-email"
              checked={profile.data.weekly_email_enabled}
              onCheckedChange={(v) => toggle.mutate(v)}
              disabled={toggle.isPending}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => send.mutate()} disabled={send.isPending}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Mail />}
              {send.isPending ? "Sending" : "Send last week's report now"}
            </Button>
            {last && (
              <p className="text-xs text-muted-foreground">
                Last sent for {formatShortDate(last)} to {formatShortDate(addDays(last, 6))}.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function DemoCard() {
  const qc = useQueryClient();
  const load = useServerFn(loadDemoData);
  const clear = useServerFn(clearDemoData);
  const loadM = useMutation({
    mutationFn: async () => {
      const res = await load();
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Demo data loaded for the last three days.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearM = useMutation({
    mutationFn: async () => {
      const res = await clear();
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Demo activity removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card
      title="Demo data"
      description="Fill the last three days with sample notes, GitHub activity and a few approved items, so you can try ShipLog without a token. Your own notes are never overwritten."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="cta" onClick={() => loadM.mutate()} disabled={loadM.isPending}>
          {loadM.isPending && <Loader2 className="animate-spin" />}
          Load demo data
        </Button>
        <Button variant="ghost" onClick={() => clearM.mutate()} disabled={clearM.isPending}>
          {clearM.isPending && <Loader2 className="animate-spin" />}
          Remove demo activity
        </Button>
      </div>
    </Card>
  );
}
