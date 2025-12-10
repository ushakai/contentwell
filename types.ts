export interface CampaignDetails {
  name: string;
  messaging_angle: string;
  product_guidelines: string;
}

export interface Campaign extends CampaignDetails {
  id: string;
  user_id: string;
  created_at: string;
}

export interface Contact {
  id?: string;
  contact_id?: string;
  campaign_id?: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  title: string;
  raw_data?: Record<string, string>;
}

export interface GeneratedResult {
  id?: string;
  campaign_id?: string;
  contact_id?: string;
  contact: Contact;
  subject: string;
  body: string;
  researchSummary: string;
}

export enum AppStep {
  CAMPAIGN_DETAILS = 1,
  UPLOAD_CONTACTS = 2,
  REVIEW_RESULTS = 3,
}

export type ColumnMapping = {
  [key in keyof Omit<Contact, 'id' | 'campaign_id' | 'raw_data'>]: string;
};