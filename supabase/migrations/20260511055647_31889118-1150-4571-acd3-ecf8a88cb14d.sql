
-- Makeup attendance requests
CREATE TABLE IF NOT EXISTS public.makeup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  target_time timestamptz not null,
  type text not null check (type in ('clock_in','clock_out')),
  reason text,
  status request_status not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

ALTER TABLE public.makeup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own makeup" ON public.makeup_requests FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin') OR is_superadmin(auth.uid()));

CREATE POLICY "insert own makeup" ON public.makeup_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin update makeup" ON public.makeup_requests FOR UPDATE
  USING (has_role(auth.uid(),'admin') OR is_superadmin(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_superadmin(auth.uid()));

-- When approved, insert into attendance automatically
CREATE OR REPLACE FUNCTION public.handle_makeup_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    INSERT INTO public.attendance(user_id, type, clocked_at, note)
    VALUES (NEW.user_id, NEW.type::attendance_type, NEW.target_time, COALESCE('補打卡:' || NEW.reason, '補打卡'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_makeup_approval ON public.makeup_requests;
CREATE TRIGGER trg_makeup_approval
  AFTER UPDATE ON public.makeup_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_makeup_approval();

-- Allow all authenticated users to view attendance (for shared calendar)
DROP POLICY IF EXISTS "authenticated view attendance" ON public.attendance;
CREATE POLICY "authenticated view attendance" ON public.attendance FOR SELECT
  TO authenticated
  USING (true);
