import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessagesSquare, ShieldCheck, UserPlus, Hash } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/lib/useSession";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Feedback Feed — your own community servers" },
      {
        name: "description",
        content:
          "Create a community server, add channels with their own permissions, invite people by link or username, and keep the conversation moderated.",
      },
      { property: "og:title", content: "Feedback Feed — your own community servers" },
      {
        property: "og:description",
        content: "Create servers, set channel permissions, invite and moderate. Sign in with Google.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: MessagesSquare,
    title: "Your own servers",
    body: "Start empty, then build the spaces you actually want to talk in.",
  },
  {
    icon: Hash,
    title: "Channels with rules",
    body: "Mark a channel read-only and pick exactly who is allowed to post.",
  },
  {
    icon: UserPlus,
    title: "Invite your people",
    body: "Share a join link or invite someone straight to their account.",
  },
  {
    icon: ShieldCheck,
    title: "Moderation built in",
    body: "Promote helpers, remove members, and ban anyone who ruins it.",
  },
];

function Landing() {
  const { user, loading } = useSessionUser();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [sentConfirm, setSentConfirm] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app", replace: true });
  }, [loading, user, navigate]);

  async function signIn() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Could not sign in. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/app" });
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail || password.length < 6) {
      toast.error("Enter your email and a password of at least 6 characters.");
      return;
    }
    setEmailBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { emailRedirectTo: window.location.origin },
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
    if (error) {
      toast.error(error.message);
      return;
    }
  }

  async function forgotPassword() {
    const mail = email.trim();
    if (!mail) {
      toast.error("Enter your email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent.");
  }

  async function resendConfirmation() {
    const mail = email.trim();
    if (!mail) return;
    setResendBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: mail,
      options: { emailRedirectTo: window.location.origin },
    });
    setResendBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setResent(true);
    toast.success("Confirmation email sent again.");
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative mx-auto flex max-w-5xl flex-col px-6 py-20">
        <header className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
            F
          </div>
          <span className="font-display text-lg font-semibold">Feedback Feed</span>
        </header>

        <section className="mt-24 max-w-2xl">
          <h1 className="font-display text-5xl leading-tight font-bold sm:text-6xl">
            Rooms for the conversations that matter.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Feedback Feed gives every community its own server, its own channels, and its own rules
            about who gets to speak. Sign in and start from a clean slate.
          </p>
          <div className="mt-10 max-w-sm rounded-2xl bg-surface p-6 glow-ring">
            <Button
              size="lg"
              onClick={signIn}
              disabled={busy}
              className="w-full font-semibold"
            >
              {busy ? "Opening Google…" : "Continue with Google"}
            </Button>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or use email
              <span className="h-px flex-1 bg-border" />
            </div>

            {sentConfirm ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation link to {email.trim()}. Open it to finish creating your
                  account, then come back and sign in.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={resendBusy || resent}
                  onClick={resendConfirmation}
                >
                  {resent ? "Sent again — check your inbox" : resendBusy ? "Sending…" : "Send again"}
                </Button>
              </div>
            ) : (
              <form onSubmit={submitEmail} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={emailBusy} className="w-full">
                  {emailBusy
                    ? "Working…"
                    : mode === "signup"
                      ? "Create account"
                      : "Sign in"}
                </Button>
              </form>
            )}

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  setSentConfirm(false);
                  setMode(mode === "signup" ? "signin" : "signup");
                }}
              >
                {mode === "signup" ? "I already have an account" : "Create an account"}
              </button>
              {mode === "signin" && (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={forgotPassword}
                >
                  Forgot password?
                </button>
              )}
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            New accounts start with no servers.
          </p>
        </section>


        <section className="mt-24 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl bg-surface p-6 glow-ring">
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-display text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
