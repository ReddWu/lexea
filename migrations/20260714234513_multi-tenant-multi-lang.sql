-- Multi-tenant (user_id) + multi-language (lang) support for Mia.
-- Existing rows keep user_id NULL until claimed by their owner after first
-- Google sign-in (see /api/claim-legacy).

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS definition text,
  ADD COLUMN IF NOT EXISTS phonetic text;

ALTER TABLE public.words
  ADD CONSTRAINT words_lang_check CHECK (lang IN ('en', 'zh', 'es', 'fr', 'ja'));

-- lemma is now unique per user per language, not globally
ALTER TABLE public.words DROP CONSTRAINT IF EXISTS words_lemma_key;
CREATE UNIQUE INDEX IF NOT EXISTS words_user_lemma_lang_key
  ON public.words (user_id, lemma, lang);

-- Learner profile (cross-session tutor memory), one row per user
CREATE TABLE IF NOT EXISTS public.learner_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile text NOT NULL DEFAULT '',
  sessions integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: owners only, on both tables
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners can read" ON public.words
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners can insert" ON public.words
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners can update" ON public.words
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners can delete" ON public.words
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

ALTER TABLE public.learner_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners can read" ON public.learner_profile
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "owners can insert" ON public.learner_profile
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "owners can update" ON public.learner_profile
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.words TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.learner_profile TO authenticated;

-- anon gets nothing: no policies for anon on either table
REVOKE ALL ON public.words FROM anon;
REVOKE ALL ON public.learner_profile FROM anon;
