-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  week_starts_on text NOT NULL DEFAULT 'monday' CHECK (week_starts_on IN ('monday','sunday')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- DAILY ENTRIES
CREATE TABLE public.daily_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  entry_date date NOT NULL,
  raw_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_entries TO authenticated;
GRANT ALL ON public.daily_entries TO service_role;
ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own entries select" ON public.daily_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own entries insert" ON public.daily_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own entries update" ON public.daily_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own entries delete" ON public.daily_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER daily_entries_updated_at BEFORE UPDATE ON public.daily_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- GITHUB ACTIVITY
CREATE TABLE public.github_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  external_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('commit','pr_opened','pr_merged','issue_opened','issue_comment','pr_comment','review')),
  repo text NOT NULL,
  title text NOT NULL DEFAULT '',
  body_excerpt text,
  url text,
  sha text,
  state text,
  occurred_at timestamptz NOT NULL,
  activity_date date NOT NULL,
  additions integer,
  deletions integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
CREATE INDEX github_activity_user_date_idx ON public.github_activity (user_id, activity_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_activity TO authenticated;
GRANT ALL ON public.github_activity TO service_role;
ALTER TABLE public.github_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own activity select" ON public.github_activity FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own activity insert" ON public.github_activity FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own activity update" ON public.github_activity FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own activity delete" ON public.github_activity FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ITEMS
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  entry_id uuid REFERENCES public.daily_entries(id) ON DELETE SET NULL,
  item_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('shipped','fixed','learned','helped','reviewed','in_progress','planned')),
  text text NOT NULL,
  impact_note text,
  source_activity_ids uuid[] NOT NULL DEFAULT '{}',
  from_note boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_user_date_idx ON public.items (user_id, item_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own items select" ON public.items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own items insert" ON public.items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own items update" ON public.items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own items delete" ON public.items FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- REPORTS
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  type text NOT NULL CHECK (type IN ('standup','weekly','brag')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  markdown text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_user_created_idx ON public.reports (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own reports select" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own reports insert" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own reports update" ON public.reports FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own reports delete" ON public.reports FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- GITHUB CONNECTIONS (sensitive: no browser access at all)
CREATE TABLE public.github_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  github_username text NOT NULL,
  token text NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.github_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.github_connections TO service_role;
ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role (server code) can read or write.

CREATE OR REPLACE FUNCTION public.connection_status()
RETURNS TABLE (github_username text, last_synced_at timestamptz, connected boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.github_username, c.last_synced_at, true
  FROM public.github_connections c WHERE c.user_id = auth.uid()
  UNION ALL
  SELECT NULL::text, NULL::timestamptz, false
  WHERE NOT EXISTS (SELECT 1 FROM public.github_connections c2 WHERE c2.user_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connection_status() TO authenticated;