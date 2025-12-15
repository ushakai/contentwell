import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import CampaignWorkspace from './components/CampaignWorkspace';
import SparklesIcon from './components/icons/SparklesIcon';

const App: React.FC = () => {
  const { session, loading } = useAuth();
  const [activeCampaignId, setActiveCampaignId] = useState<string | number | null>(null);

  // Handle OAuth callback fallback
  // This catches cases where Supabase redirects to root (/) instead of /auth-callback.html
  React.useEffect(() => {
    if (window.opener && window.location.hash.includes('access_token')) {
      console.log('[App] Detected OAuth hash in popup on root URL');

      // We need to parse the hash manually since we are outside the auth-callback page
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');
      const providerToken = params.get('provider_token');

      if (accessToken) {
        console.log('[App] Found valid token, notifying parent');

        // Construct a session-like object to send back
        // We might not have full user details here, but we have the tokens
        const sessionData = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: expiresIn ? parseInt(expiresIn) : 3600,
          provider_token: providerToken,
          user: {
            id: 'temp-id', // We let the parent fetch the real user
            app_metadata: {
              // Try to guess provider or default
              provider: params.get('provider') || 'facebook' // Common fallback
            }
          }
        };

        // Notify parent
        window.opener.postMessage({
          type: 'OAUTH_SUCCESS',
          session: sessionData
        }, window.location.origin);

        // Close self
        window.close();
      }
    }
  }, []);

  const handleStartCampaign = (campaignId: string | number | null) => {
    setActiveCampaignId(campaignId);
  };

  const handleExitWorkspace = () => {
    setActiveCampaignId(null);
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <SparklesIcon className="h-12 w-12 text-primary animate-spin" />
        </div>
      );
    }

    if (!session) {
      return <Auth />;
    }

    if (activeCampaignId !== null) { // Check for not null to allow new campaigns (id=0)
      return <CampaignWorkspace campaignId={activeCampaignId} onExit={handleExitWorkspace} />;
    }

    return <Dashboard onStartCampaign={handleStartCampaign} />;
  };

  return <div className="min-h-screen bg-background">{renderContent()}</div>;
};

export default App;