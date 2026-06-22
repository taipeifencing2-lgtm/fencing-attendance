
-- 1. Extend leave_type enum with new types
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'marriage';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'paternity';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'bereavement';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'military';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'indigenous';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'occupational_injury';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'maternity_sick';

-- 2. Extend app_role enum with new roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'leader';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretary_general';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'executive_director';

-- 3. Add hire_date to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hire_date date;

-- 4. Add attachment + two-stage approval to leave_requests
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS leader_status public.request_status,
  ADD COLUMN IF NOT EXISTS leader_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS leader_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS exec_status public.request_status,
  ADD COLUMN IF NOT EXISTS exec_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS exec_reviewed_at timestamptz;

-- 5. Helper: check role at-or-above leader
CREATE OR REPLACE FUNCTION public.is_leader_or_above(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role::text IN ('leader','secretary_general','executive_director','admin','superadmin')
  )
$$;

-- 6. Helper: check role at-or-above executive (executive_director or secretary_general)
CREATE OR REPLACE FUNCTION public.is_exec_or_above(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role::text IN ('secretary_general','executive_director','admin','superadmin')
  )
$$;

-- 7. Update leave_requests UPDATE policy so leader/exec can also review
DROP POLICY IF EXISTS "leader update leave" ON public.leave_requests;
CREATE POLICY "leader update leave"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (public.is_leader_or_above(auth.uid()))
WITH CHECK (public.is_leader_or_above(auth.uid()));

-- 8. Allow leader/exec to view leave requests
DROP POLICY IF EXISTS "leader view leave" ON public.leave_requests;
CREATE POLICY "leader view leave"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (public.is_leader_or_above(auth.uid()));

-- 9. Storage bucket for leave attachments (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('leave-attachments', 'leave-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 10. Storage RLS: users upload to their own folder
DROP POLICY IF EXISTS "users upload own leave attachments" ON storage.objects;
CREATE POLICY "users upload own leave attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'leave-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "users view own leave attachments" ON storage.objects;
CREATE POLICY "users view own leave attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'leave-attachments'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_leader_or_above(auth.uid())
  )
);

DROP POLICY IF EXISTS "users delete own leave attachments" ON storage.objects;
CREATE POLICY "users delete own leave attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'leave-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
