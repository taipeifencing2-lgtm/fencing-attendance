-- ============================================================
-- Recreate all admin RPCs that were created in the SQL editor
-- to ensure they have the correct signatures and implementations.
-- ============================================================

-- ============================================================
-- get_all_profiles()
-- Returns all profiles with roles for the admin backend.
-- Role filter: superadmin/admin see everyone, others see
--   everyone except superadmin users.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE
    (is_superadmin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
    OR NOT is_superadmin(p.id)
  ORDER BY p.full_name NULLS LAST, p.email;
$$;
REVOKE ALL ON FUNCTION public.get_all_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;

-- ============================================================
-- get_all_roles()
-- Returns all user_roles rows for admin role management.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_all_roles()
RETURNS SETOF public.user_roles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ur.*
  FROM public.user_roles ur
  ORDER BY ur.user_id;
$$;
REVOKE ALL ON FUNCTION public.get_all_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_roles() TO authenticated;

-- ============================================================
-- get_all_leave_requests(p_start, p_end)
-- Returns leave requests within the month range.
-- Role-based filter:
--   superadmin / admin → all records
--   secretary / exec   → all except superadmin users
--   leader             → only plain employees
--   others             → own records only
-- ============================================================
DROP FUNCTION IF EXISTS public.get_all_leave_requests(timestamptz, timestamptz);

CREATE FUNCTION public.get_all_leave_requests(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS SETOF public.leave_requests
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lr.*
  FROM public.leave_requests lr
  WHERE
    lr.start_at >= p_start AND lr.start_at < p_end
    AND (
      -- superadmin or admin: see everything
      (is_superadmin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
      OR
      -- secretary / exec: see all except superadmin users
      (is_secretary_or_above(auth.uid())
         AND NOT is_superadmin(lr.user_id)
         AND NOT has_role(lr.user_id, 'admin'::app_role))
      OR
      -- leader: only plain employees
      (has_role(auth.uid(), 'leader'::app_role)
         AND NOT is_leader_or_above(lr.user_id))
      OR
      -- fallback: own record
      lr.user_id = auth.uid()
    )
  ORDER BY lr.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_all_leave_requests(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_leave_requests(timestamptz, timestamptz) TO authenticated;

-- ============================================================
-- Also add a leave_requests SELECT policy for leader_or_above
-- (for direct table access in admin update flows)
-- ============================================================
DROP POLICY IF EXISTS "leader view all leave" ON public.leave_requests;
CREATE POLICY "leader view all leave" ON public.leave_requests
  FOR SELECT
  USING (auth.uid() = user_id OR is_leader_or_above(auth.uid()));

DROP POLICY IF EXISTS "leader update leave" ON public.leave_requests;
CREATE POLICY "leader update leave" ON public.leave_requests
  FOR UPDATE
  USING (is_leader_or_above(auth.uid()))
  WITH CHECK (is_leader_or_above(auth.uid()));
