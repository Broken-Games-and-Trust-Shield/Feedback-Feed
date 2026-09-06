import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
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

  const nameQuery = useQuery({
    queryKey: ["invite-name", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("server_name_by_code", { _code: code });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
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
          {nameQuery.isLoading
            ? "Checking this invite…"
            : nameQuery.data
              ? "Accept the invite to start chatting with this community."
              : "This invite link doesn't seem to work any more."}
        </p>
        <Button
          className="mt-6 w-full"
          onClick={join}
          disabled={busy || loading || !nameQuery.data}
        >
          {user ? "Join server" : "Continue with Google"}
        </Button>
      </div>
    </main>
  );
}
