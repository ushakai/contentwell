"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../utils/supabaseClient";
import { uploadBase64Image } from "../utils/uploadBase64Image";
import { useAuth } from "../hooks/useAuth";
import { generateAllGeminiContent, generateImageWithGemini } from "../services/gemini_content_service";
import ResultsDisplay from "./ResultsDisplay";

export default function ({
  campaignId,
  autoGenerate = false,
  onExit,
}: {
  campaignId: string;
  autoGenerate?: boolean;
  onExit: () => void;
}) {
  const { user } = useAuth();

  // top-level hooks only
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);
  const [openSubtype, setOpenSubtype] = useState<string | null>(null);

  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"generate" | "results">(autoGenerate ? "generate" : "results");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedItems, setGeneratedItems] = useState<any[]>([]);
  const hasGenerated = useRef(false);

  const [imageStates, setImageStates] = useState<{ [key: number]: { loading: boolean; url: string | null } }>({});
  const [globalImageGenerating, setGlobalImageGenerating] = useState(false);
  const [modalImage, setModalImage] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────────
  // Load campaign
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!user || !campaignId) return;
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
  // Auto-generate
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoGenerate || !campaign) return;
    if (hasGenerated.current) return;
    hasGenerated.current = true;
    generateAllContent();
  }, [campaign, autoGenerate]);

  // ──────────────────────────────────────────────────────────────
  // generateAllContent
  // ──────────────────────────────────────────────────────────────
  const generateAllContent = async () => {
    if (!campaign) return;
    setGenerating(true);
    try {
      const result = await generateAllGeminiContent(campaign);
      let items = result.content.map((c: any) => ({
        type: c.type,
        subtype: c.subtype ?? null,
        platform: c.platform ?? null,
        generated_text: c.text,
        metadata: c.metadata ?? {},
      }));

      // if campaign is review mode, just set generatedItems for review UI
      if (campaign.mode === "review") {
        setGeneratedItems(items);
        setMode("results");
        setGenerating(false);
        return;
      }

      // otherwise persist to DB and set generatedItems from DB insertion result
      const dbItems = items.map((item: any) => ({
        campaign_id: campaign.id,
        user_id: user?.id,
        content_type: item.type,
        subtype: item.subtype,
        generated_text: item.generated_text,
        metadata: item.metadata,
      }));
      await supabase.from("generated_content").insert(dbItems);
      setGeneratedItems(dbItems);
      setMode("results");
    } finally {
      setGenerating(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Save all
  // ──────────────────────────────────────────────────────────────
  const approveAndSaveAll = async () => {
    setSaving(true);
    setSaveMessage("Uploading images and saving content...");

    try {
      const finalItems: any[] = [];

      for (let i = 0; i < generatedItems.length; i++) {
        const item = generatedItems[i];
        let finalImageUrl = item.metadata.generated_image_url;
        let savedPath: string | null = null;

        setSaveMessage(`Processing item ${i + 1} of ${generatedItems.length}...`);

        if (item.metadata?.temp_base64_image) {
          const uploadPath = `campaign_${campaign.id}/item_${i}_${Date.now()}.png`;
          const publicUrl = await uploadBase64Image(item.metadata.temp_base64_image, uploadPath);
          finalImageUrl = publicUrl;
          savedPath = uploadPath;

          // update item metadata
          item.metadata.generated_image_url = publicUrl;
          delete item.metadata.temp_base64_image;
        }

        finalItems.push({
          campaign_id: campaign.id,
          user_id: user?.id,
          content_type: item.type,
          subtype: item.subtype,
          generated_text: item.generated_text,
          metadata: item.metadata,
          generated_image_path: savedPath,
        });
      }

      setSaveMessage("Saving to database...");

      const { error } = await supabase.from("generated_content").insert(finalItems);
      if (error) throw error;

      setSaveMessage("Successfully saved!");

      setTimeout(() => {
        setSaving(false);
        onExit();
      }, 800);
    } catch (err) {
      setSaveMessage("Failed to save. Please try again.");
      console.error(err);
      setTimeout(() => setSaving(false), 1500);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Early returns
  // ──────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="p-20 text-center text-3xl text-foreground">Loading campaign...</div>
    );
  if (!campaign)
    return (
      <div className="p-20 text-center text-destructive text-3xl">Campaign not found</div>
    );

  // Grouping computed once per render (no hooks)
  // we store original index so we can reference imageStates and update generatedItems safely
  const groups: Record<string, Array<{ item: any; idx: number }>> = {};
  generatedItems.forEach((it, idx) => {
    const t = it.content_type ?? it.type ?? "unknown";
    if (!groups[t]) groups[t] = [];
    groups[t].push({ item: it, idx });
  });

  // ──────────────────────────────────────────────────────────────
  // Main render
  // ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* SAVE OVERLAY */}
      {saving && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-center items-center z-50 text-white">
          <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          <p className="text-xl font-semibold mt-6">{saveMessage}</p>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmSave && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-card text-foreground p-10 rounded-2xl shadow-xl w-[420px] text-center border border-border">
            <h2 className="text-2xl font-bold mb-6">Save All Content?</h2>
            <p className="text-muted-foreground mb-8">Are you sure you want to approve & save all generated content?</p>

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
      <div className={`max-w-7xl mx-auto p-8 space-y-12 text-foreground relative ${saving ? "pointer-events-none opacity-40" : ""}`}>
        <div className="text-center">
          <h1 className="text-5xl font-bold">{campaign?.name ?? "Content Review"}</h1>
        </div>

        {/* GENERATING LOADER */}
        {generating && (
          <div className="text-center py-32">
            <div className="w-32 h-32 mx-auto border-8 border-muted border-t-primary rounded-full animate-spin"></div>
            <h3 className="text-4xl font-bold mt-10 text-primary">Generating...</h3>
          </div>
        )}

        {/* CONTENT REVIEW GROUPED BY TYPE */}
        {campaign?.mode === "review" && generatedItems.length > 0 && (
          <>
            <div className="space-y-8">
              {Object.entries(groups).map(([type, list], tIndex) => {
                const displayType = type.replace("_", " ");
                const typeOpen = openType === type;

                return (
                  <div
                    key={type + "-" + tIndex}
                    className="border border-border rounded-2xl bg-card shadow"
                  >
                    {/* TYPE HEADER */}
                    <button
                      className="w-full px-6 py-5 flex justify-between items-center text-left"
                      onClick={() => setOpenType(typeOpen ? null : type)}
                    >
                      <h2 className="text-2xl font-bold capitalize">{displayType}</h2>
                      <span className="text-primary text-xl">{typeOpen ? "▲" : "▼"}</span>
                    </button>

                    {/* TYPE CONTENT */}
                    {typeOpen && (
                      <div className="p-6 space-y-6">
                        {list.map(({ item, idx }) => {
                          const label = item.platform
                            ? `${item.content_type || item.type} • ${item.platform}`
                            : item.subtype
                              ? `${item.content_type || item.type} • ${item.subtype}`
                              : item.content_type || item.type;

                          const subtypeKey = `${type}-${item.subtype ?? "default"}-${idx}`;
                          const isOpen = openSubtype === subtypeKey;

                          return (
                            <div
                              key={subtypeKey}
                              className="border border-border rounded-xl bg-background p-4"
                            >
                              {/* SUBTYPE HEADER */}
                              <button
                                className="w-full flex justify-between items-center text-left"
                                onClick={() => setOpenSubtype(isOpen ? null : subtypeKey)}
                              >
                                <h3 className="text-lg font-semibold text-primary">{label}</h3>
                                <span className="text-primary">
                                  {isOpen ? "▲" : "▼"}
                                </span>
                              </button>

                              {/* COLLAPSIBLE SUBTYPE CONTENT */}
                              <div
                                className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-[2000px] mt-4" : "max-h-[120px]"
                                  }`}
                              >
                                {/* WRAPPER WITH SPACING */}
                                <div className="space-y-5">
                                  {/* TEXT AREA */}
                                  <textarea
                                    className="w-full p-4 border border-border rounded-xl text-lg bg-background text-foreground leading-relaxed"
                                    rows={isOpen ? 10 : 4}
                                    value={item.generated_text}
                                    onChange={(e) => {
                                      const updated = [...generatedItems];
                                      updated[idx] = {
                                        ...updated[idx],
                                        generated_text: e.target.value,
                                      };
                                      setGeneratedItems(updated);
                                    }}
                                  />

                                  {/* IMAGE PROMPT + GENERATE + PREVIEW */}
                                  {item.metadata?.image_prompt !== undefined && (
                                    <div className="mt-4 p-4 bg-gradient-to-r from-purple-500/8 to-blue-500/8 rounded-lg border border-primary/10 space-y-4">
                                      <h4 className="font-semibold text-foreground mb-2">
                                        Image Prompt for:{" "}
                                        <span className="text-primary font-bold">{label}</span>
                                      </h4>

                                      <textarea
                                        className="w-full p-3 border border-border rounded-md bg-background text-foreground"
                                        rows={isOpen ? 10 : 2}
                                        value={item.metadata.image_prompt || ""}
                                        onChange={(e) => {
                                          const updated = [...generatedItems];
                                          updated[idx] = {
                                            ...updated[idx],
                                            metadata: {
                                              ...updated[idx].metadata,
                                              image_prompt: e.target.value,
                                            },
                                          };
                                          setGeneratedItems(updated);
                                        }}
                                      />

                                      <div className="flex items-center gap-4">
                                        <button
                                          onClick={async () => {
                                            if (!item.metadata?.image_prompt?.trim()) return;
                                            if (globalImageGenerating) {
                                              alert(
                                                "Please wait — another image is already generating."
                                              );
                                              return;
                                            }

                                            setGlobalImageGenerating(true);
                                            setImageStates((prev) => ({
                                              ...prev,
                                              [idx]: { loading: true, url: null },
                                            }));

                                            try {
                                              const base64Image =
                                                await generateImageWithGemini(
                                                  item.metadata.image_prompt
                                                );

                                              setImageStates((prev) => ({
                                                ...prev,
                                                [idx]: { loading: false, url: base64Image },
                                              }));

                                              const updated = [...generatedItems];
                                              updated[idx] = {
                                                ...updated[idx],
                                                metadata: {
                                                  ...updated[idx].metadata,
                                                  temp_base64_image: base64Image,
                                                },
                                              };
                                              setGeneratedItems(updated);
                                            } catch (err) {
                                              alert("Image generation failed. Try again.");
                                              setImageStates((prev) => ({
                                                ...prev,
                                                [idx]: { loading: false, url: null },
                                              }));
                                            } finally {
                                              setGlobalImageGenerating(false);
                                            }
                                          }}
                                          disabled={
                                            globalImageGenerating ||
                                            imageStates[idx]?.loading ||
                                            !item.metadata?.image_prompt?.trim()
                                          }
                                          className="px-5 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          {imageStates[idx]?.loading
                                            ? "Generating..."
                                            : "Generate Image"}
                                        </button>

                                        {imageStates[idx]?.loading && (
                                          <div className="text-sm text-muted-foreground">
                                            Generating image...
                                          </div>
                                        )}
                                      </div>

                                      {/* PREVIEW */}
                                      {imageStates[idx]?.url && (
                                        <div className="mt-4">
                                          <img
                                            src={imageStates[idx].url}
                                            alt="Generated"
                                            className="w-full rounded-xl border border-border shadow cursor-pointer"
                                            onClick={() =>
                                              setModalImage(imageStates[idx].url)
                                            }
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
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

            {/* APPROVE & SAVE BUTTON */}
            <div className="text-center pt-6">
              <button
                onClick={() => setShowConfirmSave(true)}
                disabled={saving}
                className="px-10 py-4 bg-green-600 text-white rounded-xl shadow hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Approve & Save All Content"}
              </button>
            </div>
          </>
        )}


        {/* IMAGE MODAL VIEW */}
        {modalImage && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex justify-center items-center z-50" onClick={() => setModalImage(null)}>
            <div className="relative max-w-3xl max-h-[90vh] p-4">
              <img src={modalImage} className="rounded-xl shadow-2xl max-h-[85vh] mx-auto transition-transform duration-300 hover:scale-105" alt="Zoomed" />
              <button className="absolute top-3 right-3 bg-white/80 text-black px-3 py-1 rounded-full shadow" onClick={() => setModalImage(null)}>✕</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
