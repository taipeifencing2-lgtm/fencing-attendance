-- 1. Add secretary_status column to leave_requests (three-stage approval)
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS secretary_status public.request_status,
  ADD COLUMN IF NOT EXISTS secretary_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS secretary_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- 2. Create site_settings table (for announcement etc.)
CREATE TABLE IF NOT EXISTS public.site_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings
DROP POLICY IF EXISTS "authenticated read site_settings" ON public.site_settings;
CREATE POLICY "authenticated read site_settings"
ON public.site_settings FOR SELECT
TO authenticated
USING (true);

-- Only admin/superadmin can write
DROP POLICY IF EXISTS "admin write site_settings" ON public.site_settings;
CREATE POLICY "admin write site_settings"
ON public.site_settings FOR ALL
TO authenticated
USING (public.is_leader_or_above(auth.uid()))
WITH CHECK (public.is_leader_or_above(auth.uid()));

-- 3. Update is_exec_or_above to include secretary_general explicitly (already done, but be safe)
CREATE OR REPLACE FUNCTION public.is_secretary_or_above(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role::text IN ('secretary_general','executive_director','admin','superadmin')
  )
$$;
