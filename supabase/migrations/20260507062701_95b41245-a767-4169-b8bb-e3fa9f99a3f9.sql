-- Add new enum values
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'official';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

-- Helper function for superadmin (uses text comparison so it works in same migration)
CREATE OR REPLACE FUNCTION public.is_superadmin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role::text = 'superadmin'
  )
$$;

-- Profiles: admin/superadmin can view & update any profile
CREATE POLICY "admin update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_superadmin(auth.uid()));

CREATE POLICY "superadmin view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

-- Attendance: superadmin can view all & update (correct clock times)
CREATE POLICY "superadmin view attendance"
ON public.attendance
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

CREATE POLICY "superadmin update attendance"
ON public.attendance
FOR UPDATE
TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

-- User roles: superadmin can also manage roles
CREATE POLICY "superadmin manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

-- Leave requests: superadmin can view & review
CREATE POLICY "superadmin view leave"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));

CREATE POLICY "superadmin update leave"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

-- Holidays & overtime: superadmin manage
CREATE POLICY "superadmin manage holidays"
ON public.holidays
FOR ALL
TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "superadmin manage overtime"
ON public.overtime_transactions
FOR ALL
TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));