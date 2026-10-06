-- ============================================================
-- Review IABD : synchronisation multi-appareils (optionnelle)
-- À exécuter UNE FOIS dans Supabase → SQL Editor (New query).
-- Crée la table de réplique ligne à ligne + les règles RLS :
-- chaque utilisateur ne voit QUE ses propres lignes.
--
-- Ensuite, branche la base à l'app (UNE base pour TOUS les
-- utilisateurs : ils ne configurent rien, ils créent juste
-- un compte) :
--   1. Supabase → Settings → API : copie l'URL du projet et
--      la clé anon.
--   2. En local : copie .env.example en .env.local et colle
--      les deux valeurs.
--   3. Sur Vercel : Project → Settings → Environment Variables,
--      mêmes noms, puis redéploie.
-- ============================================================

create table if not exists public.sync_rows (
  user_id uuid not null references auth.users(id) on delete cascade,
  store text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, store, id)
);

alter table public.sync_rows enable row level security;

drop policy if exists "sync_rows_select_own" on public.sync_rows;
create policy "sync_rows_select_own" on public.sync_rows
  for select using (auth.uid() = user_id);

drop policy if exists "sync_rows_insert_own" on public.sync_rows;
create policy "sync_rows_insert_own" on public.sync_rows
  for insert with check (auth.uid() = user_id);

drop policy if exists "sync_rows_update_own" on public.sync_rows;
create policy "sync_rows_update_own" on public.sync_rows
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sync_rows_delete_own" on public.sync_rows;
create policy "sync_rows_delete_own" on public.sync_rows
  for delete using (auth.uid() = user_id);

-- (Optionnel) Pour la connexion Google : Dashboard → Authentication
-- → Providers → Google : active le provider et colle le Client ID
-- et le Client Secret de Google Cloud Console.
-- Dans Authentication → URL Configuration, ajoute aux Redirect URLs :
--   http://localhost:3000/**
--   https://TON-DOMAINE.vercel.app/**