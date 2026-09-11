import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ModerationVerdict = { flagged: boolean; reason: string };

export const checkMessageTone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ content: z.string().min(1).max(4000) }).parse(data))
  .handler(async ({ data }): Promise<ModerationVerdict> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { flagged: false, reason: "" };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite",
          messages: [
            {
              role: "system",
              content:
                "You review short chat messages for a community app. Flag a message if it contains profanity or slurs (including censored or misspelled forms), insults, harassment, threats, sexual content, or hateful language about a person or group. Casual, friendly, or critical-but-respectful messages are not flagged. Reply with JSON only: {\"flagged\": boolean, \"reason\": string}. Keep reason under 15 words, addressed to the writer.",
            },
            { role: "user", content: data.content },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) return { flagged: false, reason: "" };
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = json.choices?.[0]?.message?.content;
      if (!raw) return { flagged: false, reason: "" };
      const parsed = JSON.parse(raw) as { flagged?: unknown; reason?: unknown };
      return {
        flagged: parsed.flagged === true,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
      };
    } catch {
      return { flagged: false, reason: "" };
    }
  });
