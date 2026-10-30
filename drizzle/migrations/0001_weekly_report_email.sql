ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weekly_email_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weekly_email_last_period date;