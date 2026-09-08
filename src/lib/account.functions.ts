import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("servers").delete().eq("owner_id", userId);
    await supabaseAdmin.from("server_members").delete().eq("user_id", userId);
    await supabaseAdmin.from("server_invites").delete().eq("invitee_id", userId);
    await supabaseAdmin.from("channel_speakers").delete().eq("user_id", userId);
    await supabaseAdmin.from("member_reports").delete().eq("reporter_id", userId);
    await supabaseAdmin.from("messages").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
