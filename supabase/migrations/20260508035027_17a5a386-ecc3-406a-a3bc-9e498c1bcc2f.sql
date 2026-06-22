
-- 1) Add display_color to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_color text;

-- 2) Allow admins (and superadmins) to update/delete attendance, like superadmin
DROP POLICY IF EXISTS "admin update attendance" ON public.attendance;
CREATE POLICY "admin update attendance"
ON public.attendance FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_superadmin(auth.uid()))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "admin delete attendance" ON public.attendance;
CREATE POLICY "admin delete attendance"
ON public.attendance FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_superadmin(auth.uid()));

-- 3) All authenticated users can view approved leaves (for shared calendar view)
DROP POLICY IF EXISTS "view approved leaves" ON public.leave_requests;
CREATE POLICY "view approved leaves"
ON public.leave_requests FOR SELECT TO authenticated
USING (status = 'approved');
