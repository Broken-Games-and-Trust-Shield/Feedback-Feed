import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/useSession";

export const Route = createFileRoute("/invite/$code")({
  head: () => ({
    meta: [
      { title: "Join a server — Feedback Feed" },
      {
        name: "description",
        content: "You've been invited to a Feedback Feed community server. Sign in and join.",
      },
      { property: "og:title", content: "Join a server — Feedback Feed" },
      {
        property: "og:description",
        content: "Accept your invitation to a Feedback Feed community server.",
      },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { code } = Route.useParams();
  const { user, loading } = useSessionUser();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [sentConfirm, setSentConfirm] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail || password.length < 8) {
      toast.error("Enter your email and a password of at least 8 characters.");
      return;
    }
    setEmailBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { emailRedirectTo: window.location.href },
      });
      setEmailBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data.session) {
        setSentConfirm(true);
        toast.success("Check your email to confirm your account.");
      }
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
    setEmailBusy(false);
    if (error) toast.error(error.message);
  }

  const nameQuery = useQuery({
    queryKey: ["invite-name", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("server_name_by_code", { _code: code });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    enabled: !!user,
  });

  async function join() {
    setBusy(true);
    if (!user) {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.href,
      });
      if (result.error) {
        setBusy(false);
        toast.error("Could not sign in. Please try again.");
      }
      return;
    }
    const { error } = await supabase.rpc("join_server_by_code", { _code: code });
    setBusy(false);
    if (error) {
      toast.error("This invite is not valid any more.");
      return;
    }
    navigate({ to: "/app" });
  }

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md rounded-2xl bg-surface p-8 text-center glow-ring">
        <h1 className="font-display text-2xl font-semibold">
          {nameQuery.data ? `Join ${nameQuery.data}` : "You've been invited"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {!user
            ? "Sign in to see and accept this invite."
            : nameQuery.isLoading
              ? "Checking this invite…"
              : nameQuery.data
                ? "Accept the invite to start chatting with this community."
                : "This invite link doesn't seem to work any more."}
        </p>
        <Button
          className="mt-6 w-full"
          onClick={join}
          disabled={busy || loading || (!!user && !nameQuery.data)}
        >
          {user ? "Join server" : "Continue with Google"}
        </Button>

        {!user && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or use email
              <span className="h-px flex-1 bg-border" />
            </div>
            {sentConfirm ? (
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to {email.trim()}. Open it, then come back to this page
                to join.
              </p>
            ) : (
              <form onSubmit={submitEmail} className="space-y-3 text-left">
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email"
                />
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    aria-label="Password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="submit" variant="secondary" disabled={emailBusy} className="w-full">
                  {emailBusy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => {
                    setSentConfirm(false);
                    setMode(mode === "signup" ? "signin" : "signup");
                  }}
                >
                  {mode === "signup" ? "I already have an account" : "Create an account"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
