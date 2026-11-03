<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Mention/#channel parsing lives in `src/lib/mentions.ts` (no Supabase imports) so it can be unit-tested with `bunx vitest run --dir src/lib`; `data.ts` re-exports it.
- The red "Unread" divider uses the channel's previous read time, captured in app.tsx before the channel is marked read and frozen per visit in ChatPanel; the logic lives in `src/lib/unread.ts` (tested with `bunx vitest run --dir src/lib`).
