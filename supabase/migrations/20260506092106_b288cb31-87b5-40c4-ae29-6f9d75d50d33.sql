
-- 員工類型 enum
DO $$ BEGIN
  CREATE TYPE public.employee_type AS ENUM ('monthly', 'hourly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_type public.employee_type NOT NULL DEFAULT 'monthly';

-- 假日表
CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  is_workday boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view holidays" ON public.holidays;
CREATE POLICY "view holidays" ON public.holidays FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manage holidays" ON public.holidays;
CREATE POLICY "admin manage holidays" ON public.holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 加班時數帳本
CREATE TABLE IF NOT EXISTS public.overtime_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hours numeric(6,2) NOT NULL, -- 正=累積, 負=折抵
  source text NOT NULL DEFAULT 'manual', -- overtime | leave_offset | manual
  reason text,
  related_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.overtime_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view own overtime" ON public.overtime_transactions;
CREATE POLICY "view own overtime" ON public.overtime_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user insert own overtime" ON public.overtime_transactions;
CREATE POLICY "user insert own overtime" ON public.overtime_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin manage overtime" ON public.overtime_transactions;
CREATE POLICY "admin manage overtime" ON public.overtime_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 請假折抵時數欄位
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS use_overtime_hours numeric(6,2) NOT NULL DEFAULT 0;

-- 當請假被核准且使用了加班時數,自動扣除
CREATE OR REPLACE FUNCTION public.handle_leave_overtime_offset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' AND NEW.use_overtime_hours > 0 THEN
    INSERT INTO public.overtime_transactions(user_id, hours, source, reason, related_id, created_by)
    VALUES (NEW.user_id, -NEW.use_overtime_hours, 'leave_offset', '請假折抵加班時數', NEW.id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_overtime_offset ON public.leave_requests;
CREATE TRIGGER trg_leave_overtime_offset
AFTER UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_leave_overtime_offset();
