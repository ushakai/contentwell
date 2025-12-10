import React, { useState, useEffect } from "react";
import CampaignDetailsForm from "./CampaignDetailsForm";
import ContentPlanningWorkspace from "./ContentPlanningWorkspace";
import ResultsDisplay from "./ResultsDisplay";
import ResultsEdit from "./ResultsEdit";
import SparklesIcon from "./icons/SparklesIcon";
import { supabase } from "../utils/supabaseClient";

// Props interface for CampaignWorkspace
interface CampaignWorkspaceProps {
  campaignId: string | number; // ID of the campaign to load, or 0 for new
  onExit: () => void; // Callback to return to the dashboard
}

/**
 * CampaignWorkspace Component
 * 
 * Acts as the main router/controller for a specific campaign workspace.
 * Determines which view to show based on the campaign state:
 * 1. CampaignDetailsForm: For creating a new campaign.
 * 2. ContentPlanningWorkspace: For generating content for a new campaign.
 * 3. ResultsDisplay: For viewing existing generated content.
 * 4. ResultsEdit: For editing existing generated content.
 */
const CampaignWorkspace: React.FC<CampaignWorkspaceProps> = ({
  campaignId: initialCampaignId,
  onExit,
}) => {
  // Detect edit mode from "edit:" prefix in the campaign ID
  // This allows us to route to the ResultsEdit component
  const isEditMode = typeof initialCampaignId === 'string' && initialCampaignId.startsWith('edit:');

  // Extract the actual UUID if in edit mode
  const actualCampaignId = isEditMode
    ? initialCampaignId.replace('edit:', '')
    : initialCampaignId;

  // State to track the current campaign ID (may change after creation)
  const [currentCampaignId, setCurrentCampaignId] = useState(actualCampaignId);

  // State to track if the campaign already has generated content
  // null = loading/checking, true = has content, false = no content
  const [hasExistingData, setHasExistingData] = useState<boolean | null>(null);

  // Effect to check if this campaign already has generated content in the database
  useEffect(() => {
    const checkExisting = async () => {
      console.log("[CampaignWorkspace] Checking existing content…", currentCampaignId);

      // If invalid ID, treat as new campaign (no existing data)
      if (!currentCampaignId || typeof currentCampaignId !== "string") {
        console.log("[CampaignWorkspace] Invalid campaign ID → treat as new.");
        setHasExistingData(false);
        return;
      }

      // Query the generated_content table to see if any items exist for this campaign
      const { data, error } = await supabase
        .from("generated_content")
        .select("id")
        .eq("campaign_id", currentCampaignId)
        .limit(1);

      if (error) {
        console.error("[CampaignWorkspace] Error checking generated_content:", error);
      }

      console.log(
        "[CampaignWorkspace] Found?",
        data?.length > 0 ? "YES" : "NO",
        data
      );

      // Update state based on query result
      setHasExistingData(data && data.length > 0);
    };

    checkExisting();
  }, [currentCampaignId]);

  // Callback handler for when a new campaign is successfully created via the form
  const handleDetailsSuccess = (newId: string) => {
    console.log("[CampaignWorkspace] New campaign created:", newId);
    setCurrentCampaignId(newId);
    setHasExistingData(false); // New campaign has no content yet
  };

  // Helper function to determine which component to render
  const renderContent = () => {
    console.log("[CampaignWorkspace] renderContent(), state:", {
      currentCampaignId,
      hasExistingData,
    });

    // 1️⃣ If new campaign (ID is 0 or null) → show CampaignDetailsForm
    if (!currentCampaignId || currentCampaignId === 0) {
      return <CampaignDetailsForm onSuccess={handleDetailsSuccess} />;
    }

    // 2️⃣ Still checking database for existing content → show Loading
    if (hasExistingData === null) {
      return <p className="text-center py-20 text-muted-foreground">Loading…</p>;
    }

    // 3️⃣ If old campaign WITH results → show ResultsDisplay OR ResultsEdit
    if (hasExistingData === true) {
      console.log(`[CampaignWorkspace] Showing: ${isEditMode ? 'ResultsEdit' : 'ResultsDisplay'}`);

      if (isEditMode) {
        return (
          <ResultsEdit
            campaignId={currentCampaignId}
            onStartOver={onExit}
          />
        );
      }

      return (
        <ResultsDisplay
          campaignId={currentCampaignId}
          onStartOver={onExit}
        />
      );
    }

    // 4️⃣ No content yet (but campaign exists) → go to ContentPlanningWorkspace to auto-generate
    console.log("[CampaignWorkspace] Showing: ContentPlanningWorkspace AUTO");
    return (
      <ContentPlanningWorkspace
        campaignId={currentCampaignId}
        autoGenerate={true}
        onExit={onExit}
      />
    );
  };

  // Determine the title based on the state
  const title =
    hasExistingData === true ? "Your Generated Content" : "AI Content Generation";

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <SparklesIcon className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Purple AI</h1>
              <p className="text-sm text-muted-foreground">Powered by Gemini 1.5 Pro</p>
            </div>
          </div>

          <button
            onClick={onExit}
            className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl transition-all flex items-center gap-2"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="max-w-7xl mx-auto p-8">
        <div className="bg-card rounded-3xl shadow-xl border border-border">
          <div className="p-10">
            <h2 className="text-4xl font-bold text-center mb-12">{title}</h2>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignWorkspace;
