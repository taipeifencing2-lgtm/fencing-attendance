-- ============================================================
-- Fix 1: Allow all authenticated users to read basic profile info
--   (name, email, display_color) so the dashboard calendar can
--   show colleagues' names and color badges.
-- ============================================================
DROP POLICY IF EXISTS "view own profile" ON public.profiles;
CREATE POLICY "view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- Fix 2: Add "withdrawn" status to request_status enum
--   so users can soft-delete (withdraw) their own pending requests.
-- ============================================================
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'withdrawn';

-- ============================================================
-- Fix 3: Allow authenticated users to set their own pending
--   leave request to "withdrawn" (soft-delete / audit trail).
-- ============================================================
DROP POLICY IF EXISTS "user withdraw own leave" ON public.leave_requests;
CREATE POLICY "user withdraw own leave"
ON public.leave_requests FOR UPDATE TO authenticated
USING  (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id);
