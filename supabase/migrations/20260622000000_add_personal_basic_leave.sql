-- Add new leave type: personal_basic (事假)
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'personal_basic';
