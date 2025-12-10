import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import CampaignWorkspace from './components/CampaignWorkspace';
import SparklesIcon from './components/icons/SparklesIcon';

const App: React.FC = () => {
  const { session, loading } = useAuth();
  const [activeCampaignId, setActiveCampaignId] = useState<string | number | null>(null);

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