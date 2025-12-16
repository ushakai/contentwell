import React, { useState, useEffect } from "react";
import { supabase } from "../utils/supabaseClient";
import { uploadBase64Image } from "../utils/uploadBase64Image";
import { generateImageWithGemini, regenerateContentText } from "../services/gemini_content_service";
import LoaderIcon from "./icons/LoaderIcon";

// Interface for the generated content structure from the database
interface ContentGenerated {
  id: string;
  idx?: number;
  campaign_id: string;
  content_type: string;
  subtype: string;
  generated_text: string;
  metadata: any;
  created_at: string;
  user_id?: string;
}

// Props interface for the ResultsEdit component
interface ResultsEditProps {
  campaignId: string;
  onStartOver: () => void;
}

// Helper to check if a string looks like a UUID
const isLikelyUUID = (s: any) =>
  typeof s === "string" && s.length === 36 && s.includes("-");

/**
 * Helper function to extract platform name from social post titles
 * e.g., "Twitter Post: ..." -> "Twitter"
 */
const extractPlatformFromTitle = (title: string): string | null => {
  if (!title) return null;

  // Common patterns: "Twitter Post:", "LinkedIn Post:", "Instagram Post:", etc.
  const match = title.match(/^(Twitter|LinkedIn|Instagram|Facebook|TikTok|YouTube)\s+(Post|Update|Content)/i);
  if (match) {
    return match[1]; // Return the platform name
  }

  return null;
};

/**
 * ResultsEdit Component
 * 
 * Allows users to view and edit generated content for a campaign.
 * Features:
 * - Editable text areas for generated content
 * - Text regeneration with custom instructions
 * - Image regeneration with editable prompts
 * - Saving changes back to the database
 */
const ResultsEdit: React.FC<ResultsEditProps> = ({
  campaignId,
  onStartOver,
}) => {
  // State for storing the list of generated content
  const [results, setResults] = useState<ContentGenerated[]>([]);
  // State for loading status
  const [isLoading, setIsLoading] = useState(true);
  // State for tracking which content card is expanded
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  // State for storing the campaign name
  const [campaignName, setCampaignName] = useState<string>("");

  // Edit mode states
  // Stores instructions for text regeneration for each item
  const [regenerateInstructions, setRegenerateInstructions] = useState<{ [key: number]: string }>({});
  // Tracks loading state for text regeneration per item
  const [regeneratingText, setRegeneratingText] = useState<{ [key: number]: boolean }>({});
  // Tracks loading state for image regeneration per item
  const [regeneratingImage, setRegeneratingImage] = useState<{ [key: number]: boolean }>({});
  // Global lock to prevent multiple simultaneous generations
  const [globalGenerating, setGlobalGenerating] = useState(false);

  // State for saving process
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // State for save confirmation modal
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // State to track unsaved changes
  const [isDirty, setIsDirty] = useState(false);

  // Toggle the expansion of a content card
  const toggleExpand = (i: number) => {
    setExpandedIndex(expandedIndex === i ? null : i);
  };

  // Effect to load campaign results and details
  useEffect(() => {
    const loadResults = async () => {
      console.log("🔍 [ResultsEdit] start loadResults, campaignId:", campaignId);

      setIsLoading(true);

      if (!campaignId) {
        console.warn("⚠️ [ResultsEdit] campaignId is falsy — aborting query");
        setResults([]);
        setIsLoading(false);
        return;
      }

      if (!isLikelyUUID(campaignId)) {
        console.warn(
          "⚠️ [ResultsEdit] campaignId does not look like a UUID:",
          campaignId
        );
      }

      try {
        // 1. Fetch Campaign Name from form_idea
        const { data: campaignData, error: campaignError } = await supabase
          .from("form_idea")
          .select("name")
          .eq("id", campaignId)
          .single();

        if (campaignData) {
          setCampaignName(campaignData.name);
        } else if (campaignError) {
          console.warn("⚠️ [ResultsEdit] Failed to fetch campaign name:", campaignError);
        }

        // 2. Fetch Generated Content
        console.log("📡 Querying generated_content (NO ORDER)...");
        const { data, error } = await supabase
          .from("generated_content")
          .select("*")
          .eq("campaign_id", campaignId);

        if (error) throw error;

        // Process and clean the data
        const cleaned = (data || []).map((item: any) => {
          let metadata = item.metadata;
          if (typeof metadata === "string") {
            try {
              metadata = JSON.parse(metadata);
            } catch {
              metadata = {};
            }
          }

          // Handle composite subtype (JSON string stored in text column)
          let subtype = item.subtype;
          let platformFromSubtype = null;

          if (subtype && (subtype.includes('{') || subtype.startsWith('"'))) {
            try {
              // Try to parse if it looks like JSON or a quoted string
              const parsed = JSON.parse(subtype);

              if (typeof parsed === 'object' && parsed !== null) {
                // It's an object like {"original_subtype":"post"}
                subtype = parsed.original_subtype || parsed.subtype || Object.values(parsed)[0] || subtype;

                if (parsed.platform) {
                  platformFromSubtype = parsed.platform;
                }
              } else if (typeof parsed === 'string') {
                // It was just a quoted string like "post"
                subtype = parsed;
              }
            } catch (e) {
              // Parsing failed, use original string
            }
          }

          // Merge platform found in subtype into metadata for consistency
          if (platformFromSubtype) {
            metadata = { ...metadata, platform: platformFromSubtype };
          }

          return {
            ...item,
            subtype,
            metadata: metadata ?? {}
          };
        });

        // Sort by created_at if possible
        cleaned.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        setResults(cleaned);
        setIsLoading(false);
      } catch (err) {
        console.error("❌ query failed:", err);
        setResults([]);
        setIsLoading(false);
      }
    };

    loadResults();
  }, [campaignId]);

  // Unsaved Changes Warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !saving) {
        e.preventDefault();
        e.returnValue = ""; // Chrome requires returnValue to be set
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, saving]);

  // Handle changes to the generated text
  const handleTextChange = (index: number, newText: string) => {
    const newResults = [...results];
    newResults[index].generated_text = newText;
    setResults(newResults);
    setIsDirty(true);
  };

  // Handle changes to regeneration instructions
  const handleInstructionChange = (index: number, instruction: string) => {
    setRegenerateInstructions(prev => ({ ...prev, [index]: instruction }));
  };

  // Handle changes to the image prompt
  const handleImagePromptChange = (index: number, newPrompt: string) => {
    const newResults = [...results];
    newResults[index].metadata.image_prompt = newPrompt;
    setResults(newResults);
    setIsDirty(true);
  };

  /**
   * Regenerate Text
   * 
   * Calls the Gemini API to regenerate text based on the current content and user instructions.
   * Updates the local state with the new text.
   */
  const handleRegenerateText = async (index: number) => {
    const item = results[index];
    const instructions = regenerateInstructions[index];

    if (!instructions || !instructions.trim()) {
      alert("Please enter instructions for regeneration.");
      return;
    }

    setRegeneratingText(prev => ({ ...prev, [index]: true }));
    setGlobalGenerating(true);

    try {
      const newText = await regenerateContentText(
        item.generated_text,
        instructions,
        item.content_type,
        item.metadata
      );

      const newResults = [...results];
      newResults[index].generated_text = newText;
      setResults(newResults);
      setIsDirty(true);

      // Clear instructions after success
      setRegenerateInstructions(prev => ({ ...prev, [index]: "" }));
    } catch (error) {
      console.error("Text regeneration failed:", error);
      alert("Failed to regenerate text. Please try again.");
    } finally {
      setRegeneratingText(prev => ({ ...prev, [index]: false }));
      setGlobalGenerating(false);
    }
  };

  /**
   * Regenerate Image
   * 
   * Calls the Gemini API to generate a new image based on the edited prompt.
   * Updates the local state with the new base64 image and marks it for upload.
   */
  const handleRegenerateImage = async (index: number) => {
    const item = results[index];
    const prompt = item.metadata.image_prompt;

    if (!prompt || !prompt.trim()) {
      alert("Image prompt is empty.");
      return;
    }

    setRegeneratingImage(prev => ({ ...prev, [index]: true }));
    setGlobalGenerating(true);

    try {
      const base64Image = await generateImageWithGemini(prompt);

      const newResults = [...results];
      // Store base64 temporarily to show preview and for saving later
      newResults[index].metadata.generated_image_url = base64Image;
      newResults[index].metadata.temp_base64_image = base64Image; // Flag for upload on save
      setResults(newResults);
      setIsDirty(true);

    } catch (error) {
      console.error("Image regeneration failed:", error);
      alert("Failed to regenerate image. Please try again.");
    } finally {
      setRegeneratingImage(prev => ({ ...prev, [index]: false }));
      setGlobalGenerating(false);
    }
  };

  /**
   * Save All Changes
   * 
   * Iterates through all items and:
   * 1. Uploads any new base64 images to Supabase Storage.
   * 2. Updates the 'generated_content' table with new text and metadata (including new image URLs).
   */
  const handleSaveChanges = async () => {
    setSaving(true);
    setSaveMessage("Uploading images and saving changes...");

    try {
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        setSaveMessage(`Processing item ${i + 1} of ${results.length}...`);

        // Upload new base64 image if exists
        if (item.metadata.temp_base64_image) {
          const uploadPath = `campaign_${campaignId}/item_${item.id}_${Date.now()}.png`;

          const publicUrl = await uploadBase64Image(
            item.metadata.temp_base64_image,
            uploadPath
          );

          item.metadata.generated_image_url = publicUrl;
          delete item.metadata.temp_base64_image;
        }

        // Update the record in database
        const { error } = await supabase
          .from("generated_content")
          .update({
            generated_text: item.generated_text,
            metadata: item.metadata,
          })
          .eq("id", item.id);

        if (error) throw error;
      }

      setSaveMessage("Successfully saved all changes!");
      setIsDirty(false);

      // Redirect back to dashboard after short delay
      setTimeout(() => {
        setSaving(false);
        onStartOver();
      }, 1000);

    } catch (err) {
      console.error("Save failed:", err);
      setSaveMessage("Failed to save changes. Please try again.");
      setTimeout(() => setSaving(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LoaderIcon className="h-12 w-12 text-primary" />
        <h3 className="text-xl font-bold text-foreground mt-6">
          Loading Content Results
        </h3>
        <p className="text-muted-foreground mt-2 text-base">
          Fetching generated content for this campaign...
        </p>
      </div>
    );
  }

  return (
    <>
      {/* SAVE CONFIRMATION MODAL */}
      {showSaveConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-card text-foreground p-10 rounded-2xl shadow-xl w-[400px] text-center border border-border">
            <h2 className="text-2xl font-bold mb-6">Save Changes?</h2>
            <p className="text-muted-foreground mb-10">
              Are you sure you want to save all changes made to this content?
            </p>

            <div className="flex justify-center gap-6">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-6 py-3 rounded-xl bg-muted text-foreground hover:bg-muted/80"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  setShowSaveConfirm(false);
                  handleSaveChanges();
                }}
                className="px-6 py-3 rounded-xl bg-green-600 text-white hover:bg-green-700"
              >
                Yes, Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE OVERLAY */}
      {saving && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-center items-center z-50 text-white">
          <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          <p className="text-xl font-semibold mt-6">{saveMessage}</p>
        </div>
      )}

      <div className="space-y-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {/* Display Campaign Name if available, else generic title */}
              {campaignName ? `Edit: ${campaignName}` : "Edit Generated Content"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? 'item' : 'items'} • Make changes and regenerate as needed
            </p>
          </div>

          <button
            onClick={() => {
              if (isDirty) {
                if (window.confirm("You have unsaved changes. Are you sure you want to leave?")) {
                  onStartOver();
                }
              } else {
                onStartOver();
              }
            }}
            className="inline-flex items-center justify-center rounded-lg bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-muted hover:ring-primary/50 transition-all duration-200"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Cancel & Back
          </button>
        </div>

        {/* Content Cards */}
        <div className="space-y-4">
          {results.map((item, index) => (
            <div key={item.id} className="bg-card border border-border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
              {/* Card Header - Collapsible */}
              <button
                onClick={() => toggleExpand(index)}
                className="w-full flex justify-between items-center px-6 py-5 hover:bg-muted/30 transition-colors duration-150 rounded-t-lg"
              >
                <div className="text-left space-y-1">
                  <p className="font-semibold text-primary text-base">
                    {item.content_type?.toUpperCase()} • {
                      (item.content_type?.toLowerCase() === 'social_post' || item.content_type?.toLowerCase() === 'social')
                        ? (item.metadata?.platform || extractPlatformFromTitle(item.metadata?.title) || item.subtype)
                        : item.subtype
                    }
                  </p>
                  <p className="text-sm text-muted-foreground font-medium">
                    {item.metadata?.title || "Untitled Content"}
                  </p>
                </div>

                <svg
                  className={`h-5 w-5 text-muted-foreground transition-transform duration-200 flex-shrink-0 ml-4 ${expandedIndex === index ? "rotate-180" : ""
                    }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded Content */}
              {expandedIndex === index && (
                <div className="border-t border-border">
                  <div className="p-6 space-y-6">

                    {/* Generated Image Section */}
                    {item.metadata?.generated_image_url && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                          Generated Image
                        </h4>
                        <div className="bg-muted/30 p-4 rounded-lg border border-border">
                          <img
                            src={item.metadata.generated_image_url}
                            className="rounded-lg border border-border shadow-sm max-w-full h-auto"
                            alt="Generated content visual"
                          />
                        </div>
                      </div>
                    )}

                    {/* Generated Text Section */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                        Generated Text
                      </h4>
                      <textarea
                        className="w-full min-h-[200px] bg-muted/50 text-foreground border border-border rounded-lg p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-y"
                        value={item.generated_text}
                        onChange={(e) => handleTextChange(index, e.target.value)}
                      />

                      {/* Regeneration Controls */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <input
                          type="text"
                          placeholder="Instructions for regeneration (e.g., 'Make it shorter', 'More professional tone')"
                          className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          value={regenerateInstructions[index] || ""}
                          onChange={(e) => handleInstructionChange(index, e.target.value)}
                        />
                        <button
                          onClick={() => handleRegenerateText(index)}
                          disabled={globalGenerating}
                          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {regeneratingText[index] ? (
                            <span className="flex items-center gap-2">
                              <LoaderIcon className="w-3 h-3 animate-spin" />
                              Regenerating...
                            </span>
                          ) : (
                            "Generate Text"
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Metadata Section */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                        Metadata
                      </h4>
                      <div className="bg-muted/40 p-5 rounded-lg border border-border space-y-4">

                        {/* Title */}
                        <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                          <span className="text-sm font-semibold text-foreground min-w-[120px]">Title:</span>
                          <span className="text-sm text-muted-foreground flex-1">
                            {item.metadata?.title || "Untitled"}
                          </span>
                        </div>

                        {/* Keywords */}
                        {Array.isArray(item.metadata?.keywords) &&
                          item.metadata.keywords.length > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                              <span className="text-sm font-semibold text-foreground min-w-[120px]">Keywords:</span>
                              <div className="flex flex-wrap gap-2 flex-1">
                                {item.metadata.keywords.map((keyword: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* Image Prompt */}
                        {typeof item.metadata?.image_prompt === "string" && (
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                              <span className="text-sm font-semibold text-foreground min-w-[120px] pt-2">Image Prompt:</span>
                              <div className="flex-1 space-y-2">
                                <textarea
                                  className="w-full min-h-[80px] bg-background border border-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                                  value={item.metadata.image_prompt}
                                  onChange={(e) => handleImagePromptChange(index, e.target.value)}
                                />
                              </div>
                            </div>

                            {/* Regenerate Image Button - Moved Here */}
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleRegenerateImage(index)}
                                disabled={globalGenerating}
                                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                              >
                                {regeneratingImage[index] ? (
                                  <span className="flex items-center gap-2">
                                    <LoaderIcon className="w-3 h-3 animate-spin" />
                                    Regenerating Image...
                                  </span>
                                ) : (
                                  "Generate Image"
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="pt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Created {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Empty State */}
        {results.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-muted-foreground text-lg font-medium">
              No generated content found for this campaign.
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              Start generating content to see results here.
            </p>
          </div>
        )}

        {/* Save Changes Button */}
        {results.length > 0 && (
          <div className="text-center pt-10 pb-6">
            <button
              onClick={() => setShowSaveConfirm(true)}
              disabled={saving || globalGenerating}
              className="px-10 py-4 bg-green-600 text-white rounded-xl shadow hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold text-lg flex items-center gap-3 mx-auto"
            >
              {saving ? (
                <>
                  <LoaderIcon className="h-5 w-5 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save All Changes
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default ResultsEdit;
