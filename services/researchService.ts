import { Contact, CampaignDetails } from "../types";

export interface ResearchInsight {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface ResearchPayload {
  insights: ResearchInsight[];
  formattedSummary: string;
  promptContext: string;
}

const DATAFORSEO_NEWS_ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/news/live/advanced';

const getDataForSeoCredentials = (): { login: string; password: string } | null => {
  // Try Vite env vars first (import.meta.env)
  let login: string | null = null;
  let password: string | null = null;

  if (typeof import.meta !== 'undefined') {
    login = (import.meta as any)?.env?.VITE_DATAFORSEO_LOGIN || null;
    password = (import.meta as any)?.env?.VITE_DATAFORSEO_PASSWORD || null;
  }

  // Fallback to process.env (for Node.js or Vite define)
  if (!login) {
    login = (typeof process !== 'undefined' && process.env?.VITE_DATAFORSEO_LOGIN) || 
            (typeof process !== 'undefined' && process.env?.DATAFORSEO_LOGIN) || 
            null;
  }

  if (!password) {
    password = (typeof process !== 'undefined' && process.env?.VITE_DATAFORSEO_PASSWORD) || 
               (typeof process !== 'undefined' && process.env?.DATAFORSEO_PASSWORD) || 
               null;
  }

  // Check if credentials are valid (not null, not undefined string, not empty)
  if (!login || !password || login === 'undefined' || password === 'undefined' || login.trim() === '' || password.trim() === '') {
    console.warn('[Research] Missing DataForSEO credentials.');
    console.warn('[Research] Looking for: VITE_DATAFORSEO_LOGIN and VITE_DATAFORSEO_PASSWORD in .env file');
    console.warn('[Research] Found login:', login ? '***' : 'NOT FOUND');
    console.warn('[Research] Found password:', password ? '***' : 'NOT FOUND');
    return null;
  }

  return { login: login.trim(), password: password.trim() };
};

const buildQuery = (contact: Contact, campaignDetails?: CampaignDetails) => {
  const fullName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
  const parts = [
    contact.company ? `"${contact.company}"` : null,
    fullName ? `"${fullName}"` : null,
    contact.title,
    contact.email,
    campaignDetails?.messaging_angle,
    campaignDetails?.product_guidelines,
  ]
    .filter(Boolean)
    .map((part) => part!.toString().trim())
    .filter((part) => part.length > 0);

  const rawDataParts = contact.raw_data
    ? Object.entries(contact.raw_data)
        .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
        .map(([key, value]) => `${key} "${value.trim()}"`)
    : [];

  const baseQuery = [...parts, ...rawDataParts].join(' ');

  // Include JSON payload for additional context
  const serializedContact = JSON.stringify({
    company: contact.company,
    fullName,
    title: contact.title,
    email: contact.email,
    raw_data: contact.raw_data,
    campaign: {
      messaging_angle: campaignDetails?.messaging_angle,
      product_guidelines: campaignDetails?.product_guidelines,
    },
  });

  return `${baseQuery} latest verified news ${serializedContact}`.trim();
};

const mapDataForSeoResults = (data: any): ResearchInsight[] => {
  const items =
    data?.tasks?.[0]?.result?.[0]?.items && Array.isArray(data.tasks[0].result[0].items)
      ? data.tasks[0].result[0].items
      : [];

  return items
    .slice(0, 3)
    .map((item: any) => ({
      title: item.title ?? item.source ?? 'Untitled Source',
      url: item.url ?? item.link,
      snippet: item.snippet ?? item.description ?? '',
      publishedDate: item.date,
    }))
    .filter((insight: ResearchInsight) => !!insight.url);
};

const formatForDisplay = (insights: ResearchInsight[]): string =>
  insights
    .map(
      (insight, index) =>
        `${index + 1}. ${insight.snippet || insight.title} (Source: ${insight.title} - ${insight.url})`
    )
    .join('\n');

const formatForPrompt = (insights: ResearchInsight[]): string =>
  insights
    .map(
      (insight, index) =>
        `Insight ${index + 1}:
- Title: ${insight.title}
- Summary: ${insight.snippet || 'N/A'}
- Published: ${insight.publishedDate || 'Unknown'}
- Source: ${insight.url}`
    )
    .join('\n\n');

export const fetchResearchForContact = async (
  contact: Contact,
  campaignDetails?: CampaignDetails
): Promise<ResearchPayload> => {
  const credentials = getDataForSeoCredentials();
  if (!credentials) {
    console.warn('[Research] DataForSEO credentials not found. Check your .env file for VITE_DATAFORSEO_LOGIN and VITE_DATAFORSEO_PASSWORD');
    return { insights: [], formattedSummary: '', promptContext: '' };
  }

  const query = buildQuery(contact, campaignDetails);
  const fullName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();

  const payload = [
    {
      language_name: 'English',
      location_name: 'United States',
      keyword: query,
      max_items: 5,
      sort_by: 'date',
    },
  ];

  const authString = btoa(`${credentials.login}:${credentials.password}`);

  try {
    console.log('[Research] Calling DataForSEO news endpoint with query:', query);
    const response = await fetch(DATAFORSEO_NEWS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Research] DataForSEO API error:', response.status, errorText);
      throw new Error(`DataForSEO responded with ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log('[Research] DataForSEO response structure:', JSON.stringify(data).substring(0, 500));
    
    // Check if there are any errors in the response
    if (data?.tasks?.[0]?.status_code && data.tasks[0].status_code !== 20000) {
      console.error('[Research] DataForSEO task error:', data.tasks[0].status_message || 'Unknown error');
      return { insights: [], formattedSummary: '', promptContext: '' };
    }

    const insights = mapDataForSeoResults(data);
    console.log('[Research] Mapped insights:', insights.length);
    
    const formattedSummary = insights.length > 0 ? formatForDisplay(insights) : '';
    const promptContext = insights.length > 0 ? formatForPrompt(insights) : '';

    return {
      insights,
      formattedSummary,
      promptContext,
    };
  } catch (error) {
    console.error('[Research] DataForSEO fetch failed:', error);
    if (error instanceof Error) {
      console.error('[Research] Error details:', error.message);
    }
    return { insights: [], formattedSummary: '', promptContext: '' };
  }
};

