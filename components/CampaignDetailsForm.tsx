// components/CampaignDetailsForm.tsx
"use client";

import React, { useState } from "react";
import ArrowRightIcon from "./icons/ArrowRightIcon";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { DEFAULT_IMPORTANT_RULES } from "../services/gemini_content_service";

// Props interface for the CampaignDetailsForm component
interface CampaignDetailsFormProps {
  onSuccess: (campaignId: string) => void;
}

/**
 * CampaignDetailsForm Component
 * 
 * A form component for creating a new content campaign.
 * Collects user inputs for:
 * - Project Name, Idea, and Brand Voice
 * - Content Types (Blog, Social, Webpages)
 * - Target Platforms
 * - Image Generation preferences
 * - Workflow Mode (Review vs. Auto)
 * 
 * Saves the campaign data to the 'form_idea' table in Supabase.
 */
const CampaignDetailsForm: React.FC<CampaignDetailsFormProps> = ({ onSuccess }) => {
  const { user } = useAuth();

  // Form State: Basic Details
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [brandVoice, setBrandVoice] = useState("");

  // Form State: Status and Errors
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form State: Content Configuration
  const [contentTypes, setContentTypes] = useState({
    blog: true,
    socialPosts: true,
    webpages: false,
  });

  // Form State: Specific Webpage Types
  const [webpageTypes, setWebpageTypes] = useState({
    solution: false,
    industry: false,
    product: false,
    pricing: false,
  });

  // Form State: Target Platforms
  const [platforms, setPlatforms] = useState({
    linkedin: false,
    facebook: false,
    twitter: false,
    instagram: false,
    gdrive: false,
  });

  // Form State: Custom Rules (Dynamic Variable)
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_IMPORTANT_RULES);

  // Form State: Image Generation Settings
  const [needsImages, setNeedsImages] = useState(true);
  const [imageFor, setImageFor] = useState({
    blog: true,
    socialPosts: true,
    webpages: true,
  });

  // Form State: Workflow Mode
  const [mode, setMode] = useState<"auto" | "review">("review");

  // Validation: Ensure required fields are filled
  const isFormValid = name.trim() && idea.trim() && brandVoice.trim();

  /**
   * Handle Form Submission
   * 
   * Validates input, constructs the data object, and inserts it into Supabase.
   * On success, calls the onSuccess callback with the new campaign ID.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid || !user) {
      setError("Please log in and fill all required fields");
      return;
    }

    setIsLoading(true);
    setError(null);

    // Prepare image configuration object matching backend expectations
    // Only include image settings if 'needsImages' is true
    const cleanedImageFor = needsImages
      ? {
        blog: contentTypes.blog ? imageFor.blog : false,
        social: contentTypes.socialPosts ? imageFor.socialPosts : false,
        webpages: contentTypes.webpages ? imageFor.webpages : false,
      }
      : null;

    try {
      // Insert new campaign into 'form_idea' table
      const { data, error } = await supabase
        .from("form_idea")
        .insert({
          user_id: user.id,
          name: name.trim(),
          idea: idea.trim(),
          brand_voice: brandVoice.trim(),
          content_types: {
            ...contentTypes,
            // Inject custom instructions into the JSON payload if enabled
            custom_instructions: useCustomPrompt ? customPrompt : null
          },
          webpage_types: webpageTypes,
          platforms,
          needs_images: needsImages,
          image_for: cleanedImageFor,
          mode,
        })
        .select()
        .single();

      if (error) throw error;

      // Notify parent component of success
      onSuccess(data.id);
    } catch (err: any) {
      console.error("Supabase error:", err);
      setError(err.message || "Failed to save project");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10 animate-fade-in text-foreground">

      {/* Error Message Display */}
      {error && (
        <div className="p-4 text-sm text-destructive-foreground bg-destructive rounded-lg">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {/* Project Name Input */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">
          Project Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Q4 Growth Content Sprint"
          className="block w-full px-4 py-3 bg-background border border-input rounded-md placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Core Idea Input */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">
          Core Idea / Theme
        </label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={4}
          placeholder="Describe the central idea or campaign theme..."
          className="block w-full px-4 py-3 bg-background border border-input rounded-md placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Brand Voice Input */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">
          Brand Voice & Guidelines
        </label>
        <textarea
          value={brandVoice}
          onChange={(e) => setBrandVoice(e.target.value)}
          rows={5}
          placeholder="Tone, writing style, brand rules, dos & don'ts..."
          className="block w-full px-4 py-3 bg-background border border-input rounded-md placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-8">

        {/* Content Types Selection */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Content Types</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ["blog", "Blog Articles"],
              ["socialPosts", "Social Posts"],
              ["webpages", "Webpages"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center space-x-3 cursor-pointer text-foreground">
                <input
                  type="checkbox"
                  checked={(contentTypes as any)[key]}
                  onChange={(e) =>
                    setContentTypes({ ...contentTypes, [key]: e.target.checked })
                  }
                  className="w-4 h-4 text-primary border-input rounded"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {/* Webpage Subtypes Selection (Conditional) */}
          {contentTypes.webpages && (
            <div className="mt-5 ml-6 grid grid-cols-2 gap-3">
              {["solution", "industry", "product", "pricing"].map((type) => (
                <label key={type} className="flex items-center space-x-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={(webpageTypes as any)[type]}
                    onChange={(e) =>
                      setWebpageTypes({
                        ...webpageTypes,
                        [type]: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-primary border-input rounded"
                  />
                  <span className="capitalize">
                    {type === "solution"
                      ? "Solution Pages"
                      : type === "industry"
                        ? "Industry Pages"
                        : type === "product"
                          ? "Product Pages"
                          : "Pricing Pages"}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Platform Selection */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Publish To</h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Google Drive - Always Visible */}
            <label className="flex items-center space-x-3 cursor-pointer text-foreground">
              <input
                type="checkbox"
                checked={platforms.gdrive}
                onChange={(e) =>
                  setPlatforms({ ...platforms, gdrive: e.target.checked })
                }
                className="w-4 h-4 text-primary border-input rounded"
              />
              <span>Google Drive</span>
            </label>

            {/* Social Platforms - Only visible if Social Posts is checked */}
            {contentTypes.socialPosts && (
              <>
                <label className="flex items-center space-x-3 cursor-pointer text-foreground">
                  <input
                    type="checkbox"
                    checked={platforms.linkedin}
                    onChange={(e) =>
                      setPlatforms({ ...platforms, linkedin: e.target.checked })
                    }
                    className="w-4 h-4 text-primary border-input rounded"
                  />
                  <span>LinkedIn</span>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer text-foreground">
                  <input
                    type="checkbox"
                    checked={platforms.twitter}
                    onChange={(e) =>
                      setPlatforms({ ...platforms, twitter: e.target.checked })
                    }
                    className="w-4 h-4 text-primary border-input rounded"
                  />
                  <span>X (Twitter)</span>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer text-foreground">
                  <input
                    type="checkbox"
                    checked={platforms.instagram}
                    onChange={(e) =>
                      setPlatforms({ ...platforms, instagram: e.target.checked })
                    }
                    className="w-4 h-4 text-primary border-input rounded"
                  />
                  <span>Instagram</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer text-foreground">
                  <input
                    type="checkbox"
                    checked={platforms.facebook}
                    onChange={(e) =>
                      setPlatforms({ ...platforms, facebook: e.target.checked })
                    }
                    className="w-4 h-4 text-primary border-input rounded"
                  />
                  <span>Facebook</span>
                </label>
              </>
            )}

            {/* Webflow - Commented out for now as requested */}
            {/* 
            <label className="flex items-center space-x-3 cursor-pointer text-foreground">
              <input
                type="checkbox"
                checked={platforms.webflow}
                onChange={(e) =>
                  setPlatforms({ ...platforms, webflow: e.target.checked })
                }
                className="w-4 h-4 text-primary border-input rounded"
              />
              <span>Webflow</span>
            </label> 
            */}
          </div>
        </div>

        {/* Image Generation Settings */}
        <div className="space-y-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Supporting Images</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Generate visuals for selected content types
              </p>
            </div>

            <button
              type="button"
              onClick={() => setNeedsImages(!needsImages)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${needsImages ? "bg-primary" : "bg-muted"
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${needsImages ? "translate-x-6" : "translate-x-1"
                  }`}
              />
            </button>
          </div>

          {/* Specific Image Targets (Conditional) */}
          {needsImages && (
            <div className="ml-8 space-y-3">
              <p className="text-xs text-muted-foreground">Generate images for:</p>

              {contentTypes.blog && (
                <label className="flex items-center space-x-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={imageFor.blog}
                    onChange={(e) =>
                      setImageFor({ ...imageFor, blog: e.target.checked })
                    }
                    className="w-4 h-4 text-primary"
                  />
                  <span>Blog Articles</span>
                </label>
              )}

              {contentTypes.socialPosts && (
                <label className="flex items-center space-x-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={imageFor.socialPosts}
                    onChange={(e) =>
                      setImageFor({ ...imageFor, socialPosts: e.target.checked })
                    }
                    className="w-4 h-4 text-primary"
                  />
                  <span>Social Media Posts</span>
                </label>
              )}

              {contentTypes.webpages && (
                <label className="flex items-center space-x-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={imageFor.webpages}
                    onChange={(e) =>
                      setImageFor({ ...imageFor, webpages: e.target.checked })
                    }
                    className="w-4 h-4 text-primary"
                  />
                  <span>Webpages</span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Workflow Mode Selection */}
        <div className="flex items-center justify-between py-6 border-t border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Workflow Mode</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "auto" ? "Auto-publish everything" : "Review before publishing"}
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={() => setMode("review")}
              className={`px-5 py-2.5 text-sm font-medium rounded-md transition ${mode === "review"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
                }`}
            >
              Manual Review
            </button>

            <button
              type="button"
              onClick={() => setMode("auto")}
              className={`px-5 py-2.5 text-sm font-medium rounded-md transition ${mode === "auto"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
                }`}
            >
              Fully Automated
            </button>
          </div>
        </div>
      </div>

      {/* CUSTOM PROMPT SECTION */}
      <div className="space-y-6 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Customize Generation Prompt</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Override "Important Content Rules" with your own instructions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUseCustomPrompt(!useCustomPrompt)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${useCustomPrompt ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${useCustomPrompt ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        {useCustomPrompt && (
          <div className="animate-fade-in-up">
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={6}
              className="block w-full px-4 py-3 bg-background border border-input rounded-md placeholder:text-muted-foreground focus:ring-2 focus:ring-primary font-mono text-sm"
              placeholder="Enter custom Important Content Rules here..."
            />
            <button
              type="button"
              onClick={() => setCustomPrompt(DEFAULT_IMPORTANT_RULES)}
              className="text-xs text-primary underline mt-2"
            >
              Reset to Default Rules
            </button>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-8">
        <button
          type="submit"
          disabled={!isFormValid || isLoading}
          className="inline-flex items-center justify-center rounded-md px-8 py-3 text-base font-semibold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
        >
          {isLoading ? "Saving Project..." : "Generate Content"}
          {!isLoading && <ArrowRightIcon className="ml-3 h-5 w-5" />}
        </button>
      </div>
    </form>
  );
};

export default CampaignDetailsForm;