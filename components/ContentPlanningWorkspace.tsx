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

    // State for showing the save confirmation modal
    const [showConfirmSave, setShowConfirmSave] = useState(false);

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
    // Trigger auto-generation if enabled
    // ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!autoGenerate || !campaign) return;
        if (hasGenerated.current) return;
        hasGenerated.current = true;
        generateAllContent();
    }, [campaign, autoGenerate]);

    // ──────────────────────────────────────────────────────────────
    // Unsaved Changes Warning
    // ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (generatedItems.length > 0 && !saving) {
                e.preventDefault();
                e.returnValue = ""; // Chrome requires returnValue to be set
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [generatedItems, saving]);

    // ──────────────────────────────────────────────────────────────
    // generateAllContent
    // Calls the Gemini service to generate content based on campaign details
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
                platform: c.platform ?? null,
                generated_text: c.text,
                metadata: c.metadata ?? {},
            }));

            // If in "review" mode (manual review), just set state and show results
            if (campaign.mode === "review") {
                setGeneratedItems(items);
                setMode("results");
                setGenerating(false);
                return;
            }

            // If in "auto" mode (skip review), insert directly into database
            // (Note: The current logic seems to default to review mode behavior mostly, 
            // but this block handles the immediate DB insert if configured)
            const dbItems = items.map((item: any) => {
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

                return {
                    campaign_id: campaign.id,
                    user_id: user?.id,
                    content_type: item.type,
                    subtype: compositeSubtype, // Storing JSON string here
                    generated_text: item.generated_text,
                    metadata: {
                        ...item.metadata,
                        platform: finalPlatform
                    },
                };
            });

            await supabase.from("generated_content").insert(dbItems);
            setGeneratedItems(dbItems);
            setMode("results");
        } finally {
            setGenerating(false);
        }
    };

    // ──────────────────────────────────────────────────────────────
    // approveAndSaveAll
    // Uploads generated images and saves all content to the database
    // ──────────────────────────────────────────────────────────────
    const approveAndSaveAll = async () => {
        setSaving(true);
        setSaveMessage("Uploading images and saving content...");

        try {
            const finalItems = [];

            for (let i = 0; i < generatedItems.length; i++) {
                const item = generatedItems[i];
                let finalImageUrl = item.metadata.generated_image_url;
                let savedPath = null;

                // Update progress message
                setSaveMessage(`Processing item ${i + 1} of ${generatedItems.length}...`);

                // Upload base64 image if present
                if (item.metadata.temp_base64_image) {
                    const uploadPath = `campaign_${campaign.id}/item_${i}_${Date.now()}.png`;

                    const publicUrl = await uploadBase64Image(
                        item.metadata.temp_base64_image,
                        uploadPath
                    );

                    finalImageUrl = publicUrl;
                    savedPath = uploadPath;

                    item.metadata.generated_image_url = publicUrl;
                    delete item.metadata.temp_base64_image;
                }

                // Normalize: Check if subtype is actually a platform name (Legacy fix)
                const knownPlatforms = ['facebook', 'twitter', 'linkedin', 'instagram', 'x'];
                const isSubtypePlatform = item.subtype && knownPlatforms.includes(item.subtype.toLowerCase());

                const finalSubtype = isSubtypePlatform ? 'post' : item.subtype;
                const finalPlatform = item.platform || (isSubtypePlatform ? item.subtype : null);

                // Encode both fields into the subtype column as a JSON string
                // This is a workaround since we cannot add new columns to the schema
                const compositeSubtype = JSON.stringify({
                    original_subtype: finalSubtype,
                    platform: finalPlatform
                });

                // Prepare item for database insertion
                finalItems.push({
                    campaign_id: campaign.id,
                    user_id: user?.id,
                    content_type: item.type,
                    subtype: compositeSubtype, // Storing JSON string here
                    generated_text: item.generated_text,
                    metadata: {
                        ...item.metadata,
                        platform: finalPlatform // Ensure platform is saved in metadata
                    },
                    generated_image_path: savedPath,
                });

            }

            setSaveMessage("Saving to database...");

            // Batch insert all items
            const { error } = await supabase.from("generated_content").insert(finalItems);
            if (error) throw error;

            setSaveMessage("Successfully saved!");

            // Delay exit to show success message
            setTimeout(() => {
                setSaving(false);
                onExit();
            }, 1000);

        } catch (err) {
            setSaveMessage("Failed to save. Please try again.");
            console.error(err);

            setTimeout(() => setSaving(false), 1500);
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

            {/* CONFIRMATION MODAL - Confirms before saving all content */}
            {showConfirmSave && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
                    <div className="bg-card text-foreground p-10 rounded-2xl shadow-xl w-[400px] text-center border border-border">
                        <h2 className="text-2xl font-bold mb-6">Save All Content?</h2>
                        <p className="text-muted-foreground mb-10">
                            Are you sure you want to approve & save all generated content?
                        </p>

                        <div className="flex justify-center gap-6">
                            <button
                                onClick={() => setShowConfirmSave(false)}
                                className="px-6 py-3 rounded-xl bg-muted text-foreground hover:bg-muted/80"
                            >
                                No
                            </button>

                            <button
                                onClick={() => {
                                    setShowConfirmSave(false);
                                    approveAndSaveAll();
                                }}
                                className="px-6 py-3 rounded-xl bg-green-600 text-white hover:bg-green-700"
                            >
                                Yes, Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT WRAPPER */}
            <div
                className={`max-w-7xl mx-auto p-8 space-y-12 text-foreground relative ${saving ? "pointer-events-none opacity-40" : ""
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
                {campaign?.mode === "review" && generatedItems.length > 0 && (
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
                                                    className="border border-border rounded-2xl bg-card shadow p-6"
                                                >
                                                    {/* TYPE HEADER - Collapsible */}
                                                    <button
                                                        className="w-full flex justify-between items-center text-left"
                                                        onClick={() => setOpenType(openType === type ? null : type)}
                                                    >
                                                        <h2 className="text-2xl font-bold capitalize">{type.replace("_", " ")}</h2>
                                                        <span className="text-primary text-xl">
                                                            {openType === type ? "▲" : "▼"}
                                                        </span>
                                                    </button>

                                                    {/* TYPE CONTENT */}
                                                    {openType === type && (
                                                        <div className="mt-6 space-y-8">
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
                                                                        className="border border-border rounded-xl bg-background p-6"
                                                                    >
                                                                        {/* SUBTYPE HEADER - Collapsible */}
                                                                        <button
                                                                            className="w-full flex justify-between items-center text-left"
                                                                            onClick={() =>
                                                                                setOpenSubtype(isOpen ? null : subKey)
                                                                            }
                                                                        >
                                                                            <h3 className="text-lg font-semibold text-primary">
                                                                                {capitalizeLabel(label)}
                                                                            </h3>
                                                                            <span className="text-primary">
                                                                                {isOpen ? "▲" : "▼"}
                                                                            </span>
                                                                        </button>

                                                                        {/* COLLAPSIBLE SUBTYPE CONTENT */}
                                                                        <div
                                                                            className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[1500px] mt-6" : "max-h-[2000px]"
                                                                                }`}
                                                                        >
                                                                            {/* TEXTAREA PREVIEW - Editable */}
                                                                            <div className="space-y-3">
                                                                                <textarea
                                                                                    className="w-full p-4 border border-border rounded-xl text-lg bg-background text-foreground leading-relaxed"
                                                                                    rows={isOpen ? 15 : 4} // compact preview
                                                                                    value={item.generated_text}
                                                                                    onChange={(e) => {
                                                                                        const updated = [...generatedItems];
                                                                                        updated[item.__idx].generated_text = e.target.value;
                                                                                        setGeneratedItems(updated);

                                                                                    }}
                                                                                />
                                                                            </div>

                                                                            {/* IMAGE BLOCK - If item needs an image */}
                                                                            {item.metadata?.image_prompt && (
                                                                                <div className="mt-6 p-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-2xl border border-primary/20">
                                                                                    <h4 className="font-semibold text-foreground mb-4">
                                                                                        Image Prompt for:{" "}
                                                                                        <span className="text-primary font-bold">
                                                                                            {label}
                                                                                        </span>
                                                                                    </h4>

                                                                                    {/* Editable Image Prompt */}
                                                                                    <textarea
                                                                                        className="w-full p-4 border border-border rounded-xl bg-background text-foreground mb-4"
                                                                                        rows={4}
                                                                                        value={item.metadata.image_prompt}
                                                                                        onChange={(e) => {
                                                                                            const updated = [...generatedItems];
                                                                                            updated[item.__idx].metadata.image_prompt = e.target.value;

                                                                                            setGeneratedItems(updated);
                                                                                        }}
                                                                                    />

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
                                                                                                    [i]: { loading: false, url: base64Image },
                                                                                                }));

                                                                                                const updated = [...generatedItems];
                                                                                                updated[item.__idx].metadata.temp_base64_image = base64Image;
                                                                                                setGeneratedItems(updated);
                                                                                            } catch (err) {
                                                                                                alert("Image generation failed.");
                                                                                                setImageStates((prev) => ({
                                                                                                    ...prev,
                                                                                                    [i]: { loading: false, url: null },
                                                                                                }));
                                                                                            } finally {
                                                                                                setGlobalGenerating(false);
                                                                                            }
                                                                                        }}
                                                                                        disabled={
                                                                                            globalGenerating ||
                                                                                            imageStates[i]?.loading ||
                                                                                            !item.metadata.image_prompt.trim()
                                                                                        }
                                                                                        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
                                                                                    >
                                                                                        {imageStates[i]?.loading
                                                                                            ? "Generating..."
                                                                                            : "Generate Image"}
                                                                                    </button>

                                                                                    {/* Generated Image Preview */}
                                                                                    {imageStates[i]?.url && (
                                                                                        <div className="mt-4">
                                                                                            <img
                                                                                                src={imageStates[i].url}
                                                                                                className="w-full rounded-xl border shadow"
                                                                                                onClick={() =>
                                                                                                    setModalImage(imageStates[i].url)
                                                                                                }
                                                                                            />
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
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

                        {/* APPROVE & SAVE BUTTON */}
                        <div className="text-center pt-10">
                            <button
                                onClick={() => setShowConfirmSave(true)}
                                disabled={saving}
                                className="px-10 py-4 bg-green-600 text-white rounded-xl shadow 
                         hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? "Saving..." : "Approve & Save All Content"}
                            </button>
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
        </>
    );
}
