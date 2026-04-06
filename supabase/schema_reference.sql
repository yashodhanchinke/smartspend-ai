-- Standalone database schema reference.
-- This file is not imported by the app and does not affect runtime behavior.
-- Paste your current Supabase schema here for future reference.

-- Suggested contents:
-- 1. create table statements
-- 2. alter table constraints
-- 3. indexes
-- 4. enums
-- 5. policies if you want them documented too

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  type text NOT NULL,
  balance numeric DEFAULT 0,
  color text,
  icon text,
  is_default boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.ai_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  insight_type text,
  message text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT ai_insights_pkey PRIMARY KEY (id),
  CONSTRAINT ai_insights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own ai insights"
ON public.ai_insights
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ai insights"
ON public.ai_insights
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own ai insights"
ON public.ai_insights
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own ai insights"
ON public.ai_insights
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
CREATE TABLE public.budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text,
  amount numeric,
  period text,
  created_at timestamp without time zone DEFAULT now(),
  category_id uuid,
  spent numeric DEFAULT 0,
  mode text DEFAULT 'automatic'::text,
  budget_type text DEFAULT 'category'::text,
  notes text,
  color text DEFAULT '#FF4433'::text,
  CONSTRAINT budgets_pkey PRIMARY KEY (id),
  CONSTRAINT budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT budgets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.budget_categories (
  budget_id uuid NOT NULL,
  category_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT budget_categories_pkey PRIMARY KEY (budget_id, category_id),
  CONSTRAINT budget_categories_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.budgets(id),
  CONSTRAINT budget_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text,
  type text,
  icon text,
  color text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  title text,
  target_amount numeric,
  current_amount numeric DEFAULT 0,
  start_date date,
  end_date date,
  color text,
  CONSTRAINT goals_pkey PRIMARY KEY (id),
  CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.labels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text,
  color text,
  CONSTRAINT labels_pkey PRIMARY KEY (id),
  CONSTRAINT labels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.loans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text,
  amount numeric,
  type text,
  start_date date,
  end_date date,
  description text,
  status text DEFAULT 'pending'::text,
  settled_at timestamp without time zone,
  settlement_transaction_id uuid,
  settlement_account_id uuid,
  CONSTRAINT loans_pkey PRIMARY KEY (id),
  CONSTRAINT loans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT loans_settlement_transaction_id_fkey FOREIGN KEY (settlement_transaction_id) REFERENCES public.transactions(id),
  CONSTRAINT loans_settlement_account_id_fkey FOREIGN KEY (settlement_account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  name text,
  email text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  transaction_id uuid,
  image_url text,
  extracted_text text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT receipts_pkey PRIMARY KEY (id),
  CONSTRAINT receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT receipts_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id)
);
CREATE TABLE public.recurring_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  title text,
  amount numeric,
  type text,
  period text,
  next_run date,
  account_id uuid,
  category_id uuid,
  CONSTRAINT recurring_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT recurring_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT recurring_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT recurring_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.sms_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  sender text,
  message text,
  amount numeric,
  merchant text,
  detected_category text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT sms_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT sms_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  account_id uuid,
  category_id uuid,
  type text,
  title text,
  amount numeric,
  description text,
  date date,
  time time without time zone,
  receipt_url text,
  created_at timestamp without time zone DEFAULT now(),
  to_account_id uuid,
  location text,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT transactions_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.user_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_to text,
  filename text NOT NULL,
  storage_path text NOT NULL,
  report_label text,
  range_start date,
  range_end date,
  filter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_text text,
  advice_text text,
  email_status text NOT NULL DEFAULT 'pending'::text,
  is_automatic boolean NOT NULL DEFAULT false,
  generated_for_month text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT user_reports_pkey PRIMARY KEY (id),
  CONSTRAINT user_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX user_reports_auto_month_unique_idx
ON public.user_reports (user_id, generated_for_month)
WHERE ((is_automatic = true) AND (generated_for_month IS NOT NULL));
CREATE INDEX user_reports_user_created_at_idx
ON public.user_reports (user_id, created_at DESC);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own reports"
ON public.user_reports
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reports"
ON public.user_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Storage reference:
-- Bucket: reports
-- Purpose: stores generated PDF files for user reports
