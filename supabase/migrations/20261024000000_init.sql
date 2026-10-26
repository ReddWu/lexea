-- Echowords · Supabase schema. Consolidates ../migrations/*.sql (the InsForge
-- history) into the final shape: per-user, per-language word library plus a
-- one-row-per-user learner profile, both owner-only under RLS.

create table public.words (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lang          text not null default 'en' check (lang in ('en', 'zh', 'es', 'fr', 'ja')),

  word          text not null,
  lemma         text not null,
  translation   text,
  definition    text,
  phonetic      text,

  context       text,
  contexts      jsonb not null default '[]'::jsonb,   -- [{sentence,url,title,at}]
  source_url    text,
  source_title  text,

  -- spaced-repetition state (SM-2 today; stability/difficulty reserved for FSRS)
  state         text not null default 'new',          -- new|learning|review|relearning
  due           timestamptz not null default now(),
  ease          double precision not null default 2.5,
  interval_days integer not null default 0,
  stability     double precision,
  difficulty    double precision,
  reps          integer not null default 0,
  lapses        integer not null default 0,
  last_review   timestamptz,

  times_used_in_chat integer not null default 0,
  status        text not null default 'active',        -- active|known|archived
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index words_user_lemma_lang_key on public.words (user_id, lemma, lang);
create index words_user_due_idx on public.words (user_id, due) where status = 'active';

create table public.learner_profile (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  profile    text not null default '',
  sessions   integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.words enable row level security;
alter table public.learner_profile enable row level security;

create policy "owners can read"   on public.words for select to authenticated using (user_id = (select auth.uid()));
create policy "owners can insert" on public.words for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owners can update" on public.words for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners can delete" on public.words for delete to authenticated using (user_id = (select auth.uid()));

create policy "owners can read"   on public.learner_profile for select to authenticated using (user_id = (select auth.uid()));
create policy "owners can insert" on public.learner_profile for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owners can update" on public.learner_profile for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.words, public.learner_profile from anon;
grant select, insert, update, delete on public.words to authenticated;
grant select, insert, update on public.learner_profile to authenticated;

-- In-app account deletion (App Store guideline 5.1.1(v)). words and
-- learner_profile cascade from auth.users.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
