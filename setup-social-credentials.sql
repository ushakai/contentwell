-- Complete SQL setup for social_credentials table
-- Run this in Supabase SQL Editor

-- 1. Verify table exists (should already be created)
-- If not, uncomment and run the CREATE TABLE statement below:

/*
CREATE TABLE IF NOT EXISTS public.social_credentials (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    platform text not null check (platform in (
        'facebook', 'instagram', 'linkedin', 'x', 'google_drive'
    )),
    access_token text not null,
    refresh_token text,
    token_type text default 'bearer',
    expires_at timestamptz,
    scopes text[],
    account_id text,
    account_name text,
    metadata jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
*/

-- 2. Add unique constraint (prevents duplicate connections)
ALTER TABLE public.social_credentials
DROP CONSTRAINT IF EXISTS social_credentials_user_platform_key;

ALTER TABLE public.social_credentials
ADD CONSTRAINT social_credentials_user_platform_key 
UNIQUE (user_id, platform);

-- 3. Create or replace the update trigger function
CREATE OR REPLACE FUNCTION update_social_credentials_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- 4. Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_social_credentials_updated_at ON public.social_credentials;

-- 5. Create the trigger
CREATE TRIGGER trigger_social_credentials_updated_at
BEFORE UPDATE ON public.social_credentials
FOR EACH ROW
EXECUTE PROCEDURE update_social_credentials_updated_at();

-- 6. Enable Row Level Security
ALTER TABLE public.social_credentials ENABLE ROW LEVEL SECURITY;

-- 7. Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own credentials" ON public.social_credentials;
DROP POLICY IF EXISTS "Users can insert/update their own credentials" ON public.social_credentials;

-- 8. Create policy for SELECT (viewing own credentials)
CREATE POLICY "Users can view their own credentials"
ON public.social_credentials FOR SELECT
USING (auth.uid() = user_id);

-- 9. Create policy for INSERT/UPDATE/DELETE (managing own credentials)
CREATE POLICY "Users can insert/update their own credentials"
ON public.social_credentials FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 10. Verify setup - Check if table and policies are created
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual 
FROM pg_policies 
WHERE tablename = 'social_credentials';

-- 11. Check existing data
SELECT 
    id,
    user_id,
    platform,
    account_name,
    created_at,
    LENGTH(access_token) as token_length
FROM public.social_credentials
ORDER BY created_at DESC;
