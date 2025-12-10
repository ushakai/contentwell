import React, { useState, useContext, createContext } from 'react';

// Create a CampaignContext to share campaignId
const CampaignContext = createContext({
  campaignId: '',
  setCampaignId: (id: string) => {},
});

export const CampaignProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [campaignId, setCampaignId] = useState('');

  return (
    <CampaignContext.Provider value={{ campaignId, setCampaignId }}>
      {children}
    </CampaignContext.Provider>
  );
};

export const useCampaign = () => useContext(CampaignContext);