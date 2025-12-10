import { GoogleGenAI } from "@google/genai";

let geminiClient: GoogleGenAI | null = null;

const getGeminiApiKey = (): string => {
  const key =
    (typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_GEMINI_API_KEY ||
      (import.meta as any)?.env?.GEMINI_API_KEY
      : undefined) ||
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY;

  if (!key || key === "undefined") {
    throw new Error("Missing GEMINI API key.");
  }

  return key;
};

const getGeminiClient = () => {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  }
  return geminiClient;
};

// ──────────────────────────────────────────────────────────────
// TEXT GENERATION
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// DYNAMIC PROMPT LOGIC
// ──────────────────────────────────────────────────────────────
export const DEFAULT_IMPORTANT_RULES = `- All long-form content (blog posts, articles, webpage copy, landing pages, emails, newsletters) MUST be returned in plain text only. 
- Do NOT use any HTML, Markdown, headings (#, ##), bullet points, numbered lists, code blocks, or formatting symbols.
- Content must be simple, readable text paragraphs.`;

export async function generateAllGeminiContent(campaign: any) {
  const ai = getGeminiClient();

  const userImagePrefs = campaign.image_for || {};

  // Check if custom instructions are provided in the content_types JSON (hack to avoid schema change)
  const customRules = campaign.content_types?.custom_instructions || DEFAULT_IMPORTANT_RULES;

  // Collapse social posts BEFORE prompting Gemini
  if (campaign.content_types?.social_post) {
    const hasAny = Object.values(campaign.content_types.social_post).some(v => v);
    if (hasAny) {
      campaign.content_types.social_post = { merged: true };
    }
  }

  campaign.image_types = {
    blog: !!userImagePrefs.blog,
    social: !!userImagePrefs.social,
    product_page:
      !!userImagePrefs.webpages && !!campaign.webpage_types?.product,
    industry_page:
      !!userImagePrefs.webpages && !!campaign.webpage_types?.industry,
    solution_page:
      !!userImagePrefs.webpages && !!campaign.webpage_types?.solution,
    pricing_page:
      !!userImagePrefs.webpages && !!campaign.webpage_types?.pricing,
  };

  // Build prompt
  const prompt = `
You are an advanced content generation engine.
Generate ONLY the content types the user selected.
The output MUST follow the exact JSON schema below with NO deviations.

Important Content Rules:
${customRules}

Social Media Rules:
- If "socialPosts" is selected in Content Types, generate posts ONLY for the platforms marked as "true" in "Selected Platforms".
- If a platform is marked "false" or missing, DO NOT generate content for it.
- For example, if only "linkedin" is true, generate ONLY a LinkedIn post. If "twitter" and "instagram" are true, generate one for each.

Important Image Rules:
- Every image_prompt must include a clear size requirement.
- Use this default image size unless otherwise specified: 1024 × 1024 square image.
- The prompt should describe the scene AND include: "image size: 1024x1024".

User Campaign Details:

Idea:
${campaign.idea}

Brand Voice:
${campaign.brand_voice}

Selected Content Types:
${JSON.stringify(campaign.content_types, null, 2)}

Selected Webpage Types:
${JSON.stringify(campaign.webpage_types, null, 2)}

Selected Platforms (Publish To):
${JSON.stringify(campaign.platforms, null, 2)}

Selected Image Types:
${JSON.stringify(campaign.image_types, null, 2)}

RETURN ONLY VALID JSON IN THIS EXACT FORMAT:
{
  "content":[
    {
      "type": "...",
      "subtype": "...",
      "platform": "Twitter | LinkedIn | Instagram | Facebook | etc (REQUIRED for social posts)",
      "text": "plain text only — no html, no markdown, no bullets",
      "metadata": {
        "title": "...",
        "keywords": ["..."],
        "image_prompt": "description + image size: 1024x1024" 
      }
    }
  ]
}
IMPORTANT:
- For social posts, "type" must be "social", "subtype" must be "post" (unless it's a "thread" or "story"), and "platform" MUST be the platform name.
- For non-social content, "platform" should be null.
`;


  // Call Gemini
  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const rawText = response.text || "";

  const cleaned = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  // ──────────────────────────────────────────
  // CREATE A TXT FILE (input + output)
  // ──────────────────────────────────────────
  const textFileContent =
    `===== INPUT PROMPT =====

${prompt}

===== OUTPUT FROM GEMINI =====

${cleaned}
`;

  const blob = new Blob([textFileContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  // Auto-download
  const link = document.createElement("a");
  link.href = url;
  link.download = `gemini_output_${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return parsed;
}


// ──────────────────────────────────────────────────────────────
// NEW — DIRECT CLIENT-SIDE IMAGE GENERATION (NO API ROUTE)
// ──────────────────────────────────────────────────────────────

export async function generateImageWithGemini(prompt: string): Promise<string> {
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: prompt,
  });

  const part = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data
  );

  if (!part) {
    console.error("Invalid Gemini image response:", response);
    throw new Error("Gemini did not return an image.");
  }

  const base64 = part.inlineData.data;

  // 🔥 SUPER IMPORTANT → RETURN A COMPLETE DATA URL
  return `data:image/png;base64,${base64}`;
}

// ──────────────────────────────────────────────────────────────
// NEW — REGENERATE TEXT CONTENT WITH INSTRUCTIONS
// ──────────────────────────────────────────────────────────────

export async function regenerateContentText(
  existingText: string,
  userInstructions: string,
  contentType: string,
  metadata: any
): Promise<string> {
  const ai = getGeminiClient();

  const prompt = `
You are an advanced content regeneration engine.

The user has existing content that they want you to improve based on their instructions.

EXISTING CONTENT:
${existingText}

CONTENT TYPE: ${contentType}
CONTENT TITLE: ${metadata?.title || 'Untitled'}

USER INSTRUCTIONS FOR IMPROVEMENT:
${userInstructions}

IMPORTANT RULES:
- Return ONLY plain text (no HTML, no Markdown, no formatting symbols like #, *, -, etc.)
- Keep the same general style and tone as the original
- Apply the user's instructions to improve the content
- Return ONLY the regenerated text content, nothing else

REGENERATED CONTENT:
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: prompt,
  });

  const regeneratedText = response.text || "";
  return regeneratedText.trim();
}
