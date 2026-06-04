-- =========================================================================
-- Add Stripe billing columns and Seeker premium metadata to profiles
-- =========================================================================
-- This migration is idempotent (uses IF NOT EXISTS / DO blocks) so re-running
-- is safe. It extends the existing `profiles` table instead of creating a
-- separate `seeker_profiles` table to keep the data model consistent with
-- the existing `plan` / `visa_type` pattern.

-- -------------------------------------------------------------------------
-- 1. Stripe billing columns
-- -------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 2. Seeker premium metadata columns
-- -------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS visa_expiry date,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS has_sir boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_foodsafe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Useful indexes for employer filtering on the PRO dashboard
CREATE INDEX IF NOT EXISTS idx_profiles_visa_expiry
  ON public.profiles(visa_expiry)
  WHERE visa_expiry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_neighborhood
  ON public.profiles(neighborhood)
  WHERE neighborhood IS NOT NULL;

-- -------------------------------------------------------------------------
-- 3. Lightweight CHECK on availability JSON shape
-- -------------------------------------------------------------------------
-- availability is expected to be a (possibly empty) JSON object whose values
-- are arrays of strings, e.g. { "monday": ["morning", "evening"], ... }
-- A strict shape check is intentionally not enforced at the DB level to
-- preserve forward-compat; the application is responsible for validation.

-- -------------------------------------------------------------------------
-- 4. RLS - the existing policies already permit the owner to UPDATE their
--    own profile row, so no policy changes are required here.
-- -------------------------------------------------------------------------

-- -------------------------------------------------------------------------
-- 5. Comments (visible in psql \d+ and Supabase Studio)
-- -------------------------------------------------------------------------
COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe customer ID (cus_...) used by the Billing Portal and webhook';
COMMENT ON COLUMN public.profiles.stripe_subscription_id IS 'Stripe subscription ID (sub_...) of the active PRO plan';
COMMENT ON COLUMN public.profiles.visa_expiry IS 'Visa expiry date supplied by the seeker (PRO-employer visible)';
COMMENT ON COLUMN public.profiles.neighborhood IS 'Neighborhood where the seeker wants to work (Downtown, Burnaby, Kitsilano, ...)';
COMMENT ON COLUMN public.profiles.has_sir IS 'Serving It Right certificate (BC liquor service certificate)';
COMMENT ON COLUMN public.profiles.has_foodsafe IS 'FoodSafe certificate (BC food handling certificate)';
COMMENT ON COLUMN public.profiles.availability IS 'Weekly availability matrix, e.g. { "monday": ["morning", "evening"], ... }';
