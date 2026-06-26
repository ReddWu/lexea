-- vocab-app · cloud mirror table (InsForge / Postgres)
-- Local storage (chrome.storage.local) is the source of truth. This table is
-- the OPTIONAL cloud copy that powers cross-device sync + openclaw + the review
-- site. The extension upserts rows here by `lemma`; no DB function is needed
-- because all merge logic runs locally before the push.

create table if not exists public.words (
  id            uuid primary key default gen_random_uuid(),

  word          text not null,
  lemma         text not null unique,
  translation   text,

  context       text,
  contexts      jsonb not null default '[]'::jsonb,   -- [{sentence,url,title,at}]

  source_url    text,
  source_title  text,

  -- spaced-repetition state (FSRS / SM-2)
  state         text not null default 'new',          -- new|learning|review|relearning
  due           timestamptz not null default now(),
  stability     double precision,
  difficulty    double precision,
  reps          integer not null default 0,
  lapses        integer not null default 0,
  last_review   timestamptz,

  times_used_in_chat integer not null default 0,       -- openclaw signal
  status        text not null default 'active',        -- active|known|archived
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists words_due_idx    on public.words (due)    where status = 'active';
create index if not exists words_status_idx on public.words (status);

-- v1 access model: you run your OWN private InsForge project and ship its anon
-- key only in your own extension config. So the anon role may use the table.
-- UPGRADE PATH (public multi-user): add user_id default auth.uid() and scope
-- policies with `using (auth.uid() = user_id)`.
alter table public.words enable row level security;

drop policy if exists "vocab anon read"  on public.words;
drop policy if exists "vocab anon write" on public.words;

create policy "vocab anon read"  on public.words
  for select to anon, authenticated using (true);

create policy "vocab anon write" on public.words
  for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.words to anon, authenticated;
