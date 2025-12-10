// components/SmartLeadSection.tsx
import React, { useState, useEffect } from 'react';
import { validateSmartLeadCredentials } from '../utils/smartLeadHelper';
import { supabase } from '../utils/supabaseClient';
import { GeneratedResult } from '../types';

interface SmartLeadSectionProps {
  onBack: () => void;
  apiKey: string;
  campaignId: string;
  supabaseCampaignId: string | number;
  onApiKeyChange: (value: string) => void;
  onCampaignIdChange: (value: string) => void;
}

const SmartLeadSection: React.FC<SmartLeadSectionProps> = ({
  onBack,
  apiKey,
  campaignId,
  supabaseCampaignId,
  onApiKeyChange,
  onCampaignIdChange,
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [results, setResults] = useState<GeneratedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const previousResultsRef = React.useRef<GeneratedResult[] | null>(null);
  const mountedRef = React.useRef(true);
  const isInitialLoadRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAndFormatLeads = async () => {
    console.clear();
    console.log('SmartLeadSection: Starting lead fetch...');
    console.log('DB Campaign ID (supabaseCampaignId):', supabaseCampaignId, typeof supabaseCampaignId);

    if (!supabaseCampaignId) {
      console.error('NO CAMPAIGN ID PASSED TO SmartLeadSection!');
      setErrorMessage('Error: Campaign ID missing');
      if (isInitialLoadRef.current) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
      return;
    }

    // Only set loading on initial load
    if (isInitialLoadRef.current) {
      setLoading(true);
    }
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('generated_emails')
        .select('*, contact:contacts(*)')
        .eq('campaign_id', supabaseCampaignId);

      if (error) throw error;

      if (!mountedRef.current) return;

      console.log(`Fetched ${data?.length || 0} generated emails from DB`);

      if (!data || data.length === 0) {
        const emptyResults: GeneratedResult[] = [];
        if (JSON.stringify(previousResultsRef.current) !== JSON.stringify(emptyResults)) {
          previousResultsRef.current = emptyResults;
          setResults(emptyResults);
        }
        if (isInitialLoadRef.current) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
        return;
      }

      const formatted = data
        .map((d: any) => {
          const contact = Array.isArray(d.contact) ? d.contact[0] : d.contact;
          if (!contact?.email) return null;

          const nameParts = (contact.full_name || '').trim().split(' ');
          return {
            id: d.id,
            contact_id: d.contact_id,
            subject: d.subject_line || '',
            body: d.body || '',
            researchSummary: d.intro || '',
            contact: {
              email: contact.email,
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              company: contact.company_name || '',
            },
          } as GeneratedResult;
        })
        .filter(Boolean) as GeneratedResult[];

      if (!mountedRef.current) return;

      console.log(`Ready to push: ${formatted.length} leads`);
      
      // Only update if results actually changed
      const prevIds = JSON.stringify(previousResultsRef.current?.map(r => r.contact_id).sort());
      const newIds = JSON.stringify(formatted.map(r => r.contact_id).sort());
      const prevData = JSON.stringify(previousResultsRef.current);
      const newData = JSON.stringify(formatted);

      if (prevIds !== newIds || prevData !== newData) {
        previousResultsRef.current = formatted;
        setResults(formatted);
      }
      
      // Always set loading to false after first successful fetch
      if (isInitialLoadRef.current) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.error('Failed to load leads:', err);
      setErrorMessage('Failed to load leads: ' + err.message);
      if (isInitialLoadRef.current) {
        setLoading(false);
        isInitialLoadRef.current = false;
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!mountedRef.current) return;
      await fetchAndFormatLeads();
    };

    // Reset previous results and initial load flag when campaign changes
    previousResultsRef.current = null;
    isInitialLoadRef.current = true;
    fetchData();

    // Poll for updates every 5 seconds in background
    const interval = setInterval(() => {
      if (mountedRef.current) {
        fetchData();
      }
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [supabaseCampaignId]);

  const handleTestApi = async () => {
    if (!apiKey.trim() || !campaignId.trim()) {
      setErrorMessage('Please fill both fields');
      return;
    }

    setIsTesting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const valid = await validateSmartLeadCredentials(apiKey, campaignId);
      setIsValid(valid);
      if (valid) {
        setSuccessMessage('Credentials valid! Leads loaded.');
        await fetchAndFormatLeads(); // Refresh just in case
      } else {
        setErrorMessage('Invalid credentials');
      }
    } catch {
      setErrorMessage('Network error');
    } finally {
      setIsTesting(false);
    }
  };

  const handlePushToSmartLead = async () => {
    if (results.length === 0) return;

    setIsPushing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { data: pushed } = await supabase
        .from('generated_emails')
        .select('contact_id')
        .in('contact_id', results.map(r => r.contact_id))
        .eq('pushed_to_smartlead', true);

      const alreadyPushed = new Set((pushed || []).map(p => p.contact_id));
      const newLeads = results
        .filter(r => !alreadyPushed.has(r.contact_id))
        .map(r => ({
          email: r.contact.email,
          first_name: r.contact.firstName,
          last_name: r.contact.lastName || '',
          company_name: r.contact.company,
          custom_fields: {
            business_name: r.contact.company,
            email_content: r.body,
            email_subject: r.subject,
            research_notes: r.researchSummary,
          },
        }));

      if (newLeads.length === 0) {
        setSuccessMessage('All leads already pushed!');
        setIsPushing(false);
        return;
      }

      const res = await fetch(
        `https://server.smartlead.ai/api/v1/campaigns/${campaignId}/leads?api_key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_list: newLeads }),
        }
      );

      if (!res.ok) throw new Error(await res.text());

      // Mark as pushed
      await supabase
        .from('generated_emails')
        .update({ pushed_to_smartlead: true, pushed_at: new Date().toISOString() })
        .in('contact_id', newLeads.map(l => results.find(r => r.contact.email === l.email)?.contact_id).filter(Boolean));

      setSuccessMessage(`Pushed ${newLeads.length} leads successfully!`);
    } catch (err: any) {
      setErrorMessage('Push failed: ' + err.message);
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center border-b pb-6">
        <div>
          <h2 className="text-2xl font-bold">Push to SmartLead</h2>
          <p className="text-sm text-muted-foreground">
            DB Campaign ID: <strong>{supabaseCampaignId}</strong>
          </p>
        </div>
        <button onClick={onBack} className="btn btn-outline">Back</button>
      </div>

      <div className="space-y-6">
        <input
          type="password"
          placeholder="SmartLead API Key"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          className="w-full px-4 py-3 border rounded-lg"
        />
        <input
          type="text"
          placeholder="SmartLead Campaign ID"
          value={campaignId}
          onChange={(e) => onCampaignIdChange(e.target.value)}
          className="w-full px-4 py-3 border rounded-lg"
        />

        {errorMessage && <p className="text-red-600">{errorMessage}</p>}
        {successMessage && <p className="text-green-600">{successMessage}</p>}

        <div className="flex gap-4">
          <button
            onClick={handleTestApi}
            disabled={isTesting}
            className="px-6 py-3 bg-gray-200 rounded-lg"
          >
            {isTesting ? 'Testing...' : 'Test Credentials'}
          </button>

          {isValid && (
            <button
              onClick={handlePushToSmartLead}
              disabled={isPushing || loading || results.length === 0}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {isPushing ? 'Pushing...' : `Push ${results.length} Leads`}
            </button>
          )}
        </div>

        {loading && <p className="text-orange-600 animate-pulse">Loading leads...</p>}
        {!loading && results.length === 0 && <p className="text-red-600">No leads found</p>}
        {!loading && results.length > 0 && <p className="text-green-600">{results.length} leads ready!</p>}
      </div>
    </div>
  );
};

export default SmartLeadSection;