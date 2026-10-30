import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Moon, Settings, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("shiplog-theme", next ? "dark" : "light");
        setDark(next);
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/log", label: "Log" },
    { to: "/reports", label: "Reports" },
    { to: "/insights", label: "Insights" },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-5 sm:px-6">
        <header className="mx-auto flex max-w-6xl items-center gap-3 rounded-2xl border bg-card/70 px-4 py-3 backdrop-blur sm:px-5">
          <Link to="/log" className="text-foreground">
            <Logo />
          </Link>
          <nav className="ml-2 flex rounded-full bg-muted p-1 text-sm sm:ml-6">
            {tabs.map((t) => {
              const active = path.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link
              to="/settings"
              className={`hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-medium sm:inline-flex ${
                path.startsWith("/settings") ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Settings className="h-4 w-4" /> Settings
            </Link>
            <Link to="/settings" aria-label="Settings" className="inline-flex p-2 text-muted-foreground sm:hidden">
              <Settings className="h-4 w-4" />
            </Link>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut />
            </Button>
          </div>
        </header>
      </div>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
