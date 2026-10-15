-- The original single-user setup had wide-open policies ("vocab anon read"/
-- "vocab anon write") for anon+authenticated. Permissive policies OR together,
-- so they defeated the new owners-only policies. Drop them.
DROP POLICY IF EXISTS "vocab anon read" ON public.words;
DROP POLICY IF EXISTS "vocab anon write" ON public.words;
