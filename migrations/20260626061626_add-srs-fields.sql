-- SM-2 scheduler state used by the in-extension review page.
-- ease: easiness factor (default 2.5, floor 1.3). interval_days: current
-- inter-repetition interval in days. (stability/difficulty remain reserved
-- for a future FSRS upgrade.)
alter table public.words add column if not exists ease          double precision not null default 2.5;
alter table public.words add column if not exists interval_days integer          not null default 0;
