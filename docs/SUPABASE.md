# Supabase setup

Supabase is **optional**. Without it Nuctify runs fully offline — your library,
playlists and stats live on the device. Adding it enables:

| Feature | Needs |
| --- | --- |
| Email / Google sign-in | Auth |
| Cloud sync of library, playlists and settings | `user_data` table |
| Share a read-only playlist link | `shared_playlists` table + `VITE_PUBLIC_WEB_URL` for the apps |
| **Blend** (merged taste of two people) | `taste_profiles`, `blends`, `join_blend()` |
| **Collaborative playlists** | `collab_playlists`, `collab_members` + RPCs + Realtime |
| **Jam** (listen together live) | Realtime broadcast/presence only — no table |

Everything lives in one idempotent script: [`supabase/schema.sql`](../supabase/schema.sql).

## 1. Create the project

1. Go to <https://supabase.com/dashboard> → **New project**. Any region, free tier is fine.
2. Wait for it to finish provisioning.

## 2. Run the schema

1. Open **SQL Editor** → **New query**.
2. Paste the whole contents of `supabase/schema.sql` and click **Run**.

The script is safe to re-run: tables use `if not exists`, policies are dropped
and recreated, and functions use `create or replace`. Run it again whenever
`schema.sql` changes.

It creates:

- **Tables** `user_data`, `shared_playlists`, `taste_profiles`, `blends`,
  `collab_playlists`, `collab_members` — all with Row Level Security on.
- **RPCs** `join_blend`, `create_collab`, `join_collab`, `preview_collab`,
  `collab_add_tracks`, `collab_remove_tracks`, `leave_collab`,
  `is_collab_member` — executable by signed-in users only.
- **Realtime**: adds `collab_playlists` to the `supabase_realtime` publication
  so collaborators see edits live.

**Check it worked:** Table Editor lists the six tables, and
Database → Publications → `supabase_realtime` includes `collab_playlists`.

## 3. Copy the API keys into `.env`

Project Settings → **API**:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

Use the **anon / publishable** key only. Never put the `service_role` / secret
key in `.env` — `VITE_*` values are compiled into the app and are public.

Rebuild after changing these (`npm run build`, then the desktop/Android build):
the values are baked in at build time.

## 4. Configure Auth URLs

Authentication → **URL Configuration**:

- **Site URL**: your web deployment, e.g. `https://nuctify.vercel.app`
  (or `http://localhost:3000` while developing).
- **Redirect URLs** — add every origin the app runs on:

  ```
  http://localhost:3000/**
  https://your-deployment.vercel.app/**
  https://localhost/**
  http://tauri.localhost/**
  ```

  `https://localhost` is the Android app's origin and `http://tauri.localhost`
  is the Windows app's origin.

## 5. Auth providers

Authentication → **Providers**:

- **Email** — enabled by default. Email confirmation links open in the browser,
  not in the desktop/Android app. If most of your users sign up from the apps,
  either turn **Confirm email** off, or tell users to confirm in the browser
  and then sign in inside the app.
- **Google** (optional, web only — the apps show "use email" instead):
  1. In Google Cloud Console create an OAuth client (type *Web application*).
  2. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an
     authorised redirect URI.
  3. Paste the client ID and secret into Supabase → Providers → Google.

## 6. Realtime

Realtime is on by default for new projects. Jam uses broadcast and presence
channels, which need no extra setup. If you disabled Realtime, re-enable it
under Project Settings → Realtime.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Cloud backend not configured" | `VITE_SUPABASE_URL`/`ANON_KEY` missing or not `https://…`; rebuild after editing `.env`. |
| `relation "public.user_data" does not exist` | The schema wasn't run in this project — do step 2. |
| `function public.join_blend does not exist` | Re-run the schema; an older version is missing the RPCs. |
| Collaborators don't see changes live | `collab_playlists` isn't in the `supabase_realtime` publication — re-run the schema. |
| Redirected to the wrong page after sign-in | Add that origin to Redirect URLs (step 4). |
| Share link says "not available in this build" | Set `VITE_PUBLIC_WEB_URL` and rebuild the app. |
