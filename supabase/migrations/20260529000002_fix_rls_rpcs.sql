-- ============================================================
-- Fix 1: get_existing_roles()
--   Any authenticated user can see what roles exist in the system.
--   Used by leave submission to determine which approval stages are active.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_existing_roles()
RETURNS TABLE(role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT ur.role::text FROM public.user_roles ur;
$$;
REVOKE ALL ON FUNCTION public.get_existing_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_existing_roles() TO authenticated;

-- ============================================================
-- Fix 2: get_all_overtime_transactions()
--   SECURITY DEFINER to bypass RLS, filtered by caller role:
--     superadmin / admin        → all records
--     secretary / exec          → all except superadmin users
--     leader                    → only plain employees
--     others                    → own records only
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_all_overtime_transactions()
RETURNS SETOF public.overtime_transactions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ot.*
  FROM public.overtime_transactions ot
  WHERE
    -- superadmin or admin: see everything
    (is_superadmin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
    OR
    -- secretary / exec: see all except superadmin users
    (is_secretary_or_above(auth.uid())
       AND NOT is_superadmin(ot.user_id)
       AND NOT has_role(ot.user_id, 'admin'::app_role))
    OR
    -- leader: only plain employees (not any leader-or-above)
    (has_role(auth.uid(), 'leader'::app_role)
       AND NOT is_leader_or_above(ot.user_id))
    OR
    -- fallback: own record
    ot.user_id = auth.uid()
  ORDER BY ot.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_all_overtime_transactions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_overtime_transactions() TO authenticated;

-- ============================================================
-- Fix 3: get_all_makeup_requests()
--   Same role-based filtering as above for makeup requests.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_all_makeup_requests()
RETURNS SETOF public.makeup_requests
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT mr.*
  FROM public.makeup_requests mr
  WHERE
    (is_superadmin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
    OR
    (is_secretary_or_above(auth.uid())
       AND NOT is_superadmin(mr.user_id)
       AND NOT has_role(mr.user_id, 'admin'::app_role))
    OR
    (has_role(auth.uid(), 'leader'::app_role)
       AND NOT is_leader_or_above(mr.user_id))
    OR
    mr.user_id = auth.uid()
  ORDER BY mr.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_all_makeup_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_makeup_requests() TO authenticated;

-- ============================================================
-- Fix 4: record_overtime_for_leave()
--   SECURITY DEFINER so any approver (leader, secretary, exec)
--   can safely write the overtime-accumulation record when
--   approving an overtime-type leave request.
--   Deduction (use_overtime_hours) is handled by the existing
--   handle_leave_overtime_offset trigger — do NOT duplicate it here.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_overtime_for_leave(
  p_leave_id   uuid,
  p_user_id    uuid,
  p_start_at   timestamptz,
  p_end_at     timestamptz,
  p_leave_type text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hours numeric;
BEGIN
  -- Only handle overtime-type leave
  IF p_leave_type <> 'overtime' THEN RETURN; END IF;

  -- Idempotency: skip if a positive record already exists for this leave
  IF EXISTS (
    SELECT 1 FROM public.overtime_transactions
    WHERE related_id = p_leave_id AND hours > 0
    LIMIT 1
  ) THEN RETURN; END IF;

  v_hours := ROUND(
    (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 3600)::numeric,
    2
  );
  IF v_hours <= 0 THEN RETURN; END IF;

  INSERT INTO public.overtime_transactions(
    user_id, hours, source, reason, related_id, created_by
  ) VALUES (
    p_user_id,
    v_hours,
    'overtime',
    '加班申請核准 (' || LEFT(p_leave_id::text, 8) || ')',
    p_leave_id,
    auth.uid()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_overtime_for_leave(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_overtime_for_leave(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;

-- ============================================================
-- Fix 5: makeup_requests RLS — allow all leader_or_above to
--   view and update (approve / reject) makeup requests.
-- ============================================================
DROP POLICY IF EXISTS "view own makeup" ON public.makeup_requests;
CREATE POLICY "view own makeup" ON public.makeup_requests
  FOR SELECT
  USING (auth.uid() = user_id OR is_leader_or_above(auth.uid()));

DROP POLICY IF EXISTS "admin update makeup" ON public.makeup_requests;
CREATE POLICY "leader update makeup" ON public.makeup_requests
  FOR UPDATE
  USING (is_leader_or_above(auth.uid()))
  WITH CHECK (is_leader_or_above(auth.uid()));
