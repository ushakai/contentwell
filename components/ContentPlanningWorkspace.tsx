"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../utils/supabaseClient";
import { uploadBase64Image } from "../utils/uploadBase64Image";
import { useAuth } from "../hooks/useAuth";
import { generateAllGeminiContent, generateImageWithGemini } from "../services/gemini_content_service";
import LoaderIcon from "./icons/LoaderIcon";

// Helper function to capitalize labels properly
// e.g., "social_post" -> "Social Post"
const capitalizeLabel = (text: string): string => {
    return text
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

/**
 * ContentPlanningWorkspace Component
 * 
 * This component handles the generation and review of AI content.
 * It fetches campaign details, triggers AI generation, displays the results for review,
 * allows for image generation, and saves the final approved content to the database.
 */
export default function ContentPlanningWorkspace({
    campaignId,
    autoGenerate = false,
    onExit,
}: {
    campaignId: string;
    autoGenerate?: boolean;
    onExit: () => void;
}) {
    const { user } = useAuth();


    // State for managing the expanded/collapsed sections in the review UI
    const [openType, setOpenType] = React.useState<string | null>(null);
    const [openSubtype, setOpenSubtype] = React.useState<string | null>(null);

    // State for campaign data and loading status
    const [campaign, setCampaign] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Mode: "generate" (waiting/generating) or "results" (reviewing generated content)
    const [mode, setMode] = useState<"generate" | "results">(
        autoGenerate ? "generate" : "results"
    );

    // State for saving process
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");

    // State for generation process
    const [generating, setGenerating] = useState(false);
    const [generatedItems, setGeneratedItems] = useState<any[]>([]);
    const hasGenerated = useRef(false); // Ref to prevent double generation on mount

    // State to track image generation status for individual items
    const [imageStates, setImageStates] = useState<{
        [key: number]: { loading: boolean; url: string | null };
    }>({});

    // Global lock for generation to prevent concurrent requests
    const [globalGenerating, setGlobalGenerating] = useState(false);

    // State for the modal image viewer
    const [modalImage, setModalImage] = useState<string | null>(null);

    // ──────────────────────────────────────────────────────────────
    // Load campaign details from the database
    // ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            if (!user || !campaignId) return;

            // Fetch campaign details from form_idea table
            const { data, error } = await supabase
                .from("form_idea")
                .select("*")
                .eq("id", campaignId)
                .eq("user_id", user.id)
                .single();

            if (!error) setCampaign(data);
            setLoading(false);
        };
        load();
    }, [campaignId, user]);

    // ──────────────────────────────────────────────────────────────
    // Load existing content if NOT auto-generating (edit mode)
    // ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const loadExistingContent = async () => {
            if (autoGenerate || !campaign || !user) return;
            if (hasGenerated.current) return;
            
            hasGenerated.current = true;
            setGenerating(true);

            try {
                // Fetch existing generated content from database
                const { data, error } = await supabase
                    .from("generated_content")
                    .select("*")
                    .eq("campaign_id", campaignId)
                    .eq("user_id", user.id);

                if (error) throw error;

                if (data && data.length > 0) {
                    // Process the data to match the expected format
                    const items = data.map((item: any) => {
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
                                const parsed = JSON.parse(subtype);
                                if (typeof parsed === 'object' && parsed !== null) {
                                    subtype = parsed.original_subtype || parsed.subtype || Object.values(parsed)[0] || subtype;
                                    if (parsed.platform) {
                                        platformFromSubtype = parsed.platform;
                                    }
                                } else if (typeof parsed === 'string') {
                                    subtype = parsed;
                                }
                            } catch (e) {
                                // Parsing failed, use original string
                            }
                        }

                        // Merge platform found in subtype into metadata
                        if (platformFromSubtype) {
                            metadata = { ...metadata, platform: platformFromSubtype };
                        }

                        return {
                            type: item.content_type,
                            subtype: subtype,
                            platform: metadata.platform || platformFromSubtype || null,
                            generated_text: item.generated_text,
                            metadata: metadata ?? {},
                        };
                    });

                    setGeneratedItems(items);
                    setMode("results");

                    // Initialize image states for items that already have images
                    const initialImageStates: { [key: number]: { loading: boolean; url: string | null } } = {};
                    items.forEach((item: any, index: number) => {
                        if (item.metadata?.generated_image_url) {
                            initialImageStates[index] = {
                                loading: false,
                                url: item.metadata.generated_image_url
                            };
                        }
                    });
                    setImageStates(initialImageStates);
                }
            } catch (err) {
                console.error("Failed to load existing content:", err);
            } finally {
                setGenerating(false);
            }
        };

        loadExistingContent();
    }, [campaign, autoGenerate, campaignId, user]);

    // ──────────────────────────────────────────────────────────────
    // Trigger auto-generation if enabled
    // ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!autoGenerate || !campaign) return;
        if (hasGenerated.current) return;
        hasGenerated.current = true;
        generateAllContent();
    }, [campaign, autoGenerate]);


    // ──────────────────────────────────────────────────────────────
    // saveContentToDatabase
    // Helper function to save content items to database
    // ──────────────────────────────────────────────────────────────
    const saveContentToDatabase = async (itemsToSave: any[], isEditMode: boolean = false) => {
        if (!campaign) return;

        setSaving(true);
        setSaveMessage("Saving content...");

        try {
            const finalItems = [];

            for (let i = 0; i < itemsToSave.length; i++) {
                const item = itemsToSave[i];
                let savedPath = null;

                setSaveMessage(`Processing item ${i + 1} of ${itemsToSave.length}...`);

                // Upload base64 image if present
                if (item.metadata?.temp_base64_image) {
                    const uploadPath = `campaign_${campaign.id}/item_${i}_${Date.now()}.png`;
                    const publicUrl = await uploadBase64Image(
                        item.metadata.temp_base64_image,
                        uploadPath
                    );
                    savedPath = uploadPath;
                    item.metadata.generated_image_url = publicUrl;
                    delete item.metadata.temp_base64_image;
                }

                // Normalize: Check if subtype is actually a platform name
                const knownPlatforms = ['facebook', 'twitter', 'linkedin', 'instagram', 'x'];
                const isSubtypePlatform = item.subtype && knownPlatforms.includes(item.subtype.toLowerCase());

                const finalSubtype = isSubtypePlatform ? 'post' : item.subtype;
                const finalPlatform = item.platform || (isSubtypePlatform ? item.subtype : null);

                // Encode both fields into the subtype column as a JSON string
                const compositeSubtype = JSON.stringify({
                    original_subtype: finalSubtype,
                    platform: finalPlatform
                });

                finalItems.push({
                    campaign_id: campaign.id,
                    user_id: user?.id,
                    content_type: item.type,
                    subtype: compositeSubtype,
                    generated_text: item.generated_text,
                    metadata: {
                        ...item.metadata,
                        platform: finalPlatform
                    },
                    generated_image_path: savedPath,
                });
            }

            setSaveMessage("Saving to database...");

            // If in edit mode, delete old content first
            if (isEditMode) {
                const { error: deleteError } = await supabase
                    .from("generated_content")
                    .delete()
                    .eq("campaign_id", campaign.id)
                    .eq("user_id", user?.id);
                if (deleteError) throw deleteError;
            }

            // Insert all items
            const { error } = await supabase.from("generated_content").insert(finalItems);
            if (error) throw error;

            setSaveMessage("Successfully saved!");
            setTimeout(() => {
                setSaving(false);
                setSaveMessage("");
            }, 1000);

        } catch (err) {
            setSaveMessage("Failed to save. Please try again.");
            console.error(err);
            setTimeout(() => {
                setSaving(false);
                setSaveMessage("");
            }, 2000);
        }
    };

    // ──────────────────────────────────────────────────────────────
    // generateAllContent
    // Calls the Gemini service to generate content based on campaign details
    // Automatically saves content to database after generation
    // ──────────────────────────────────────────────────────────────
    const generateAllContent = async () => {
        if (!campaign) return;
        setGenerating(true);
        try {
            // Call the AI service
            const result = await generateAllGeminiContent(campaign);
            result.content = result.content.filter((c: any) => c.platform !== "gdrive");

            // Map the result to a standardized format
            let items = result.content.map((c: any) => ({
                type: c.type,
                subtype: c.subtype ?? null,
                platform: c.platform || c.Platform || null,
                generated_text: c.text,
                metadata: c.metadata ?? {},
            }));

            // Set items in state for display
            setGeneratedItems(items);
            setMode("results");

            // Automatically save content to database
            await saveContentToDatabase(items, !autoGenerate);

        } finally {
            setGenerating(false);
        }
    };


    // ──────────────────────────────────────────────────────────────
    // Early returns for loading and error states
    // ──────────────────────────────────────────────────────────────
    if (loading)
        return (
            <div className="p-20 text-center text-3xl text-foreground">
                Loading campaign...
            </div>
        );
    if (!campaign)
        return (
            <div className="p-20 text-center text-destructive text-3xl">
                Campaign not found
            </div>
        );

    // ──────────────────────────────────────────────────────────────
    // Main Render
    // ──────────────────────────────────────────────────────────────
    return (
        <>
            {/* SAVE OVERLAY - Shows progress during saving */}
            {saving && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col 
                      justify-center items-center z-50 text-white">
                    <div className="w-20 h-20 border-4 border-white/30 border-t-white 
                        rounded-full animate-spin"></div>
                    <p className="text-xl font-semibold mt-6">{saveMessage}</p>
                </div>
            )}


            {/* MAIN CONTENT WRAPPER */}
            <div className="max-w-7xl mx-auto p-8">
                <div className="bg-card rounded-3xl shadow-xl border border-border p-10">
                    <div
                        className={`space-y-12 text-foreground relative ${saving ? "pointer-events-none opacity-40" : ""
                            }`}
                    >
                        <div className="text-center">
                            <h1 className="text-5xl font-bold">
                                {campaign?.name ?? "Content Review"}
                            </h1>
                        </div>

                {/* GENERATING LOADER - Shows while AI is generating content */}
                {generating && (
                    <div className="text-center py-32">
                        <div className="w-32 h-32 mx-auto border-8 border-muted border-t-primary rounded-full animate-spin"></div>
                        <h3 className="text-4xl font-bold mt-10 text-primary">
                            Generating...
                        </h3>
                    </div>
                )}

                {/* CONTENT REVIEW LIST - Displays generated items grouped by type */}
                {!generating && generatedItems.length > 0 && (
                    <>
                        <div className="space-y-10">

                            {(() => {
                                // Group items by content type
                                const groups: Record<string, any[]> = {};

                                generatedItems.forEach((item, index) => {
                                    if (!groups[item.type]) groups[item.type] = [];
                                    groups[item.type].push({ ...item, __idx: index });
                                });



                                return (
                                    <div className="space-y-10">
                                        {Object.entries(groups).map(([type, items], typeIndex) => {
                                            return (
                                                <div
                                                    key={typeIndex}
                                                    className="border-2 border-primary/20 rounded-2xl bg-gradient-to-br from-card to-card/80 shadow-lg hover:shadow-xl transition-shadow p-8"
                                                >
                                                    {/* TYPE HEADER - Collapsible */}
                                                    <button
                                                        className="w-full flex justify-between items-center text-left group hover:bg-muted/30 -mx-2 px-2 py-3 rounded-xl transition-all"
                                                        onClick={() => setOpenType(openType === type ? null : type)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                                                                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <h2 className="text-2xl font-bold capitalize text-foreground">{type.replace("_", " ")}</h2>
                                                                <p className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${openType === type ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                                                {openType === type ? 'Expanded' : 'Collapsed'}
                                                            </span>
                                                            <svg className={`w-6 h-6 text-primary transition-transform duration-300 ${openType === type ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </div>
                                                    </button>

                                                    {/* TYPE CONTENT */}
                                                    {openType === type && (
                                                        <div className="mt-8 space-y-6 animate-fade-in-up">
                                                            {items.map((item, i) => {
                                                                const subtype = item.subtype || "default";
                                                                const label = item.platform
                                                                    ? `${item.type} • ${item.platform}`
                                                                    : item.subtype
                                                                        ? `${item.type} • ${item.subtype}`
                                                                        : item.type;

                                                                const subKey = `${type}-${subtype}-${i}`;
                                                                const isOpen = openSubtype === subKey;

                                                                return (
                                                                    <div
                                                                        key={i}
                                                                        className={`border-2 rounded-xl bg-background/50 backdrop-blur-sm transition-all ${isOpen ? 'border-primary shadow-lg' : 'border-border hover:border-primary/50'}`}
                                                                    >
                                                                        {/* SUBTYPE HEADER - Collapsible */}
                                                                        <button
                                                                            className="w-full flex justify-between items-center text-left p-5 hover:bg-muted/30 rounded-xl transition-all group"
                                                                            onClick={() =>
                                                                                setOpenSubtype(isOpen ? null : subKey)
                                                                            }
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isOpen ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary group-hover:bg-primary/20'}`}>
                                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                                                                    </svg>
                                                                                </div>
                                                                                <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                                                                                    {capitalizeLabel(label)}
                                                                                </h3>
                                                                            </div>
                                                                            <svg className={`w-5 h-5 text-primary transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                        </button>

                                                                        {/* COLLAPSIBLE SUBTYPE CONTENT - Only show when expanded */}
                                                                        {isOpen && (
                                                                            <div className="mt-6 pt-6 px-6 pb-6 border-t border-border space-y-8 animate-fade-in-up bg-muted/20 rounded-b-xl">
                                                                                {/* TEXTAREA - Editable Generated Text */}
                                                                                <div className="space-y-4">
                                                                                    <label className="block text-sm font-semibold text-foreground">
                                                                                        Generated Content
                                                                                    </label>
                                                                                    <textarea
                                                                                        className="w-full p-5 border-2 border-border rounded-xl text-base bg-background text-foreground leading-relaxed focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                                                                        rows={12}
                                                                                        value={item.generated_text}
                                                                                        onChange={(e) => {
                                                                                            const updated = [...generatedItems];
                                                                                            updated[item.__idx].generated_text = e.target.value;
                                                                                            setGeneratedItems(updated);
                                                                                        }}
                                                                                        placeholder="Your generated content will appear here..."
                                                                                    />
                                                                                </div>

                                                                                {/* IMAGE SECTION - If item needs an image */}
                                                                                {item.metadata?.image_prompt && (
                                                                                    <div className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border-2 border-primary/30">
                                                                                        <div className="flex items-center gap-2 mb-4">
                                                                                            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                                            </svg>
                                                                                            <h4 className="text-lg font-bold text-foreground">
                                                                                                Image for {capitalizeLabel(label)}
                                                                                            </h4>
                                                                                        </div>

                                                                                        {/* Editable Image Prompt */}
                                                                                        <div className="space-y-4 mb-6">
                                                                                            <label className="block text-sm font-semibold text-foreground">
                                                                                                Image Prompt
                                                                                            </label>
                                                                                            <textarea
                                                                                                className="w-full p-5 border-2 border-border rounded-xl bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                                                                                rows={3}
                                                                                                value={item.metadata.image_prompt}
                                                                                                onChange={(e) => {
                                                                                                    const updated = [...generatedItems];
                                                                                                    updated[item.__idx].metadata.image_prompt = e.target.value;
                                                                                                    setGeneratedItems(updated);
                                                                                                }}
                                                                                                placeholder="Describe the image you want to generate..."
                                                                                            />
                                                                                        </div>

                                                                                        {/* Generate Image Button */}
                                                                                        <button
                                                                                            onClick={async () => {
                                                                                                if (!item.metadata.image_prompt.trim()) return;

                                                                                                if (globalGenerating) {
                                                                                                    alert("Please wait — another generation is in progress.");
                                                                                                    return;
                                                                                                }

                                                                                                setGlobalGenerating(true);
                                                                                                setImageStates((prev) => ({
                                                                                                    ...prev,
                                                                                                    [item.__idx]: { loading: true, url: null }
                                                                                                }));

                                                                                                try {
                                                                                                    const base64Image = await generateImageWithGemini(
                                                                                                        item.metadata.image_prompt
                                                                                                    );

                                                                                                    setImageStates((prev) => ({
                                                                                                        ...prev,
                                                                                                        [item.__idx]: { loading: false, url: base64Image },
                                                                                                    }));

                                                                                                    const updated = [...generatedItems];
                                                                                                    updated[item.__idx].metadata.temp_base64_image = base64Image;
                                                                                                    setGeneratedItems(updated);
                                                                                                } catch (err) {
                                                                                                    alert("Image generation failed.");
                                                                                                    setImageStates((prev) => ({
                                                                                                        ...prev,
                                                                                                        [item.__idx]: { loading: false, url: null },
                                                                                                    }));
                                                                                                } finally {
                                                                                                    setGlobalGenerating(false);
                                                                                                }
                                                                                            }}
                                                                                            disabled={
                                                                                                globalGenerating ||
                                                                                                imageStates[item.__idx]?.loading ||
                                                                                                !item.metadata.image_prompt.trim()
                                                                                            }
                                                                                            className="w-full sm:w-auto px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                                                                                        >
                                                                                            {imageStates[item.__idx]?.loading ? (
                                                                                                <>
                                                                                                    <LoaderIcon />
                                                                                                    <span>Generating Image...</span>
                                                                                                </>
                                                                                            ) : (
                                                                                                <>
                                                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                                                                    </svg>
                                                                                                    <span>Generate Image</span>
                                                                                                </>
                                                                                            )}
                                                                                        </button>

                                                                                        {/* Generated Image Preview - Only show for THIS item */}
                                                                                        {imageStates[item.__idx]?.url && (
                                                                                            <div className="mt-8 space-y-4">
                                                                                                <label className="block text-sm font-semibold text-foreground">
                                                                                                    Generated Image Preview
                                                                                                </label>
                                                                                                <div className="relative group">
                                                                                                    <img
                                                                                                        src={imageStates[item.__idx].url}
                                                                                                        alt="Generated content"
                                                                                                        className="w-full h-auto rounded-xl border-2 border-primary shadow-xl cursor-pointer transition-transform hover:scale-[1.02]"
                                                                                                        onClick={() => setModalImage(imageStates[item.__idx].url)}
                                                                                                    />
                                                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-all flex items-center justify-center">
                                                                                                        <svg className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                                                                                        </svg>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <p className="text-xs text-muted-foreground text-center">
                                                                                                    Click image to view fullscreen
                                                                                                </p>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>

                    </>
                )}

                {/* IMAGE MODAL VIEW - Zoomed in view of generated images */}
                {modalImage && (
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-md flex justify-center items-center z-50"
                        onClick={() => setModalImage(null)}
                    >
                        <div className="relative max-w-3xl max-h-[90vh] p-4">
                            <img
                                src={modalImage}
                                className="rounded-xl shadow-2xl max-h-[85vh] mx-auto transition-transform duration-300 hover:scale-105"
                                alt="Zoomed"
                            />

                            <button
                                className="absolute top-3 right-3 bg-white/80 text-black px-3 py-1 rounded-full shadow"
                                onClick={() => setModalImage(null)}
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
                    </div>
                </div>
            </div>
        </>
    );
}
