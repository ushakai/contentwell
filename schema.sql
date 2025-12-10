CREATE TABLE IF NOT EXISTS public.user (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NULL,
  sector TEXT NULL,
  contact_email TEXT NULL,
  password_hash TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  CONSTRAINT user_table_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- Indexes for user table
CREATE INDEX IF NOT EXISTS idx_user_contact_email ON public."user" USING btree (contact_email) TABLESPACE pg_default;

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  messaging_angle TEXT NOT NULL,
  product_guidelines TEXT,
  target_audience TEXT,
  brand_voice TEXT,
  goal TEXT,
  product_highlights TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Indexes for campaigns table
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

CREATE TABLE IF NOT EXISTS contacts (
  contact_id TEXT PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  title TEXT,
  email TEXT NOT NULL,
  linkedin_url TEXT,
  notes TEXT,
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Indexes for contacts table
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_id ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

CREATE TABLE IF NOT EXISTS research (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(contact_id) ON DELETE CASCADE,
  company_summary TEXT,
  contact_summary TEXT,
  opportunity TEXT,
  sources TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS generated_emails (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(contact_id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subject_line TEXT,
  intro TEXT,
  body TEXT,
  call_to_action TEXT,
  signature TEXT,
  brand_voice TEXT,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Indexes for generated_emails table
CREATE INDEX IF NOT EXISTS idx_generated_emails_campaign_id ON generated_emails(campaign_id);

CREATE TABLE IF NOT EXISTS contact_progress (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(contact_id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  research_status TEXT DEFAULT 'pending',
  email_status TEXT DEFAULT 'pending',
  export_status TEXT DEFAULT 'pending',
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- Indexes for contact_progress table
CREATE INDEX IF NOT EXISTS idx_contact_progress_campaign ON contact_progress(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contact_progress_status ON contact_progress(research_status, email_status);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_campaigns_updated_at 
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_research_updated_at 
  BEFORE UPDATE ON research
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_emails_updated_at 
  BEFORE UPDATE ON generated_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_progress_updated_at 
  BEFORE UPDATE ON contact_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
