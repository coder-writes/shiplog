import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { calendarStatus, completeCalendarConnection, disconnectCalendar, startCalendarConnect } from "@/lib/calendar.functions";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/States";

function waitForOAuthCompletion(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (type !== "googleCalendarOAuthComplete" && type !== "googleCalendarOAuthFailed")
      )
        return;
      cleanup();
      if (type === "googleCalendarOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("Google did not finish connecting."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google window was closed before connecting."));
    }, 500);
  });
}

export const calendarStatusKey = ["calendar-status"] as const;

export function useCalendarStatus() {
  const status = useServerFn(calendarStatus);
  return useQuery({ queryKey: calendarStatusKey, queryFn: () => status(), staleTime: 60_000 });
}

export function CalendarCard({ Card }: { Card: (p: { title: string; description?: string; children: React.ReactNode }) => React.ReactNode }) {
  const qc = useQueryClient();
  const status = useCalendarStatus();
  const start = useServerFn(startCalendarConnect);
  const complete = useServerFn(completeCalendarConnection);
  const disconnect = useServerFn(disconnectCalendar);
  const reconnecting = !!status.data?.connected;

  const connectM = useMutation({
    mutationFn: async () => {
      const popup = window.open("", "shiplog-google-calendar", "width=600,height=720");
      if (!popup) throw new Error("Your browser blocked the Google window. Allow popups and try again.");
      let code: string | null;
      try {
        const { authorizationUrl } = await start();
        const completion = waitForOAuthCompletion(popup);
        popup.location.href = authorizationUrl;
        code = await completion;
      } catch (e) {
        popup.close();
        throw e;
      }
      if (code) await complete({ data: { code } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: calendarStatusKey });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success(reconnecting ? "Reconnected to Google Calendar." : "Google Calendar connected.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectM = useMutation({
    mutationFn: async () => {
      const res = await disconnect();
      if (!res?.ok) throw new Error("Could not disconnect Google Calendar.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: calendarStatusKey });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Google Calendar disconnected.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card
      title="Google Calendar"
      description="Optional. Your meetings show on the Log page and in your standup, so it covers work GitHub can't see. Read-only."
    >
      {status.isLoading ? (
        <LoadingState />
      ) : status.error ? (
        <ErrorState message="Could not check your calendar connection." onRetry={() => status.refetch()} />
      ) : status.data?.connected && !status.data.reconnectRequired ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="inline-flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="h-5 w-5" /> Connected
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => connectM.mutate()} disabled={connectM.isPending}>
              {connectM.isPending && <Loader2 className="animate-spin" />}
              Reconnect
            </Button>
            <Button variant="outline" onClick={() => disconnectM.mutate()} disabled={disconnectM.isPending}>
              {disconnectM.isPending && <Loader2 className="animate-spin" />}
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {status.data?.reconnectRequired && (
            <p className="text-sm text-muted-foreground">Your Google Calendar access needs to be renewed.</p>
          )}
          <Button variant="cta" onClick={() => connectM.mutate()} disabled={connectM.isPending}>
            {connectM.isPending ? <Loader2 className="animate-spin" /> : <CalendarDays />}
            {status.data?.reconnectRequired ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </Button>
        </div>
      )}
    </Card>
  );
}
