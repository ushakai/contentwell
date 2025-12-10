// src/utils/smartLeadHelper.ts

export const validateSmartLeadCredentials = async (
  apiKey: string,
  campaignId: string
): Promise<boolean> => {
  if (!apiKey?.trim() || !campaignId?.trim()) {
    console.warn('[SmartLead] Missing API key or Campaign ID');
    return false;
  }

  try {
    console.log('[SmartLead] Testing credentials for campaign:', campaignId);

    const response = await fetch(
      `https://server.smartlead.ai/api/v1/campaigns/${campaignId}?api_key=${apiKey}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }
    );

    if (response.ok) {
      console.log('[SmartLead] Credentials VALID');
      return true;
    }

    if (response.status === 401) console.warn('[SmartLead] Invalid API Key (401)');
    if (response.status === 404) console.warn('[SmartLead] Campaign not found (404)');
    return false;
  } catch (error) {
    console.error('[SmartLead] Validation failed:', error);
    return false;
  }
};