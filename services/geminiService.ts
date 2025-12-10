import { GoogleGenAI, Type } from "@google/genai";
import { CampaignDetails, Contact, GeneratedResult, ColumnMapping } from "../types";
import { ResearchPayload } from "./researchService";

const footerKeywords = ['thanks', 'thank you', 'best', 'cheers', 'regards', 'sincerely', 'warmly', 'talk soon', 'yours', 'take care'];

const stripEmailFooter = (body: string): string => {
  const lines = body.split('\n');

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }

    const normalized = trimmed.toLowerCase();
    if (
      footerKeywords.some(keyword => normalized.startsWith(keyword)) ||
      /^[-–—_]{2,}$/.test(normalized) ||
      normalized.startsWith('sent from')
    ) {
      return lines.slice(0, i).join('\n').trim();
    }
  }

  return body.trim();
};

const getGeminiApiKey = (): string => {
  const key =
    (typeof import.meta !== 'undefined'
      ? (import.meta as any)?.env?.VITE_GEMINI_API_KEY || (import.meta as any)?.env?.GEMINI_API_KEY
      : undefined) ||
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY;

  if (!key || key === 'undefined') {
    throw new Error('Missing GEMINI API key. Set VITE_GEMINI_API_KEY in your environment.');
  }

  return key;
};

let geminiClient: GoogleGenAI | null = null;

const getGeminiClient = () => {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  }
  return geminiClient;
};

export const detectCsvColumns = async (csvSnippet: string): Promise<ColumnMapping> => {
    const ai = getGeminiClient();
    const model = 'gemini-2.5-flash';
    const prompt = `
      Analyze the following CSV snippet and determine the mapping from the CSV headers to the required fields: firstName, lastName, email, company, title.

      CSV Snippet:
      \`\`\`csv
      ${csvSnippet}
      \`\`\`

      Respond with only a JSON object that maps the required field name to the corresponding header name found in the CSV. For example, if the CSV has a header "First Name", the mapping for "firstName" should be "First Name". If a field cannot be reasonably mapped, use the value "null".

      Example output:
      {
        "firstName": "first_name",
        "lastName": "last_name",
        "email": "email_address",
        "company": "company_name",
        "title": "job_title"
      }
    `;

    try {
        console.log('[Gemini] Detecting CSV columns');
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        firstName: { type: Type.STRING, nullable: true },
                        lastName: { type: Type.STRING, nullable: true },
                        email: { type: Type.STRING, nullable: true },
                        company: { type: Type.STRING, nullable: true },
                        title: { type: Type.STRING, nullable: true },
                    },
                },
            },
        });

        const mapping = JSON.parse(response.text) as ColumnMapping;
        console.log('[Gemini] Column mapping response', mapping);
        return mapping;
    } catch (error) {
        console.error("Error detecting CSV columns:", error);
        throw new Error("AI failed to analyze the CSV headers. Please map them manually.");
    }
};

export const generateEmailForContact = async (
  campaignDetails: CampaignDetails,
  contact: Contact,
  researchPayload?: ResearchPayload
): Promise<Omit<GeneratedResult, 'id' | 'campaign_id' | 'contact_id'>> => {
  const ai = getGeminiClient();
  const model = "gemini-2.5-pro";

  const hasExternalResearch = researchPayload?.promptContext && researchPayload.promptContext.trim().length > 0;
  const promptResearchSection = hasExternalResearch
    ? researchPayload.promptContext
    : 'No verified external research available for this contact.';

  const researchInstructions = hasExternalResearch
    ? `- **Step A: Research:** Review the verified external research provided below. Use these facts to personalize the email.
    - **Step B: Summarize Research:** Create a concise summary of the key research findings from the verified sources. This is for internal reference.`
    : `- **Step A: Research:** Based on the contact's title (${contact.title}) and company (${contact.company}), identify common challenges and pain points that someone in this role typically faces. Consider industry trends and typical responsibilities for this position.
    - **Step B: Summarize Research:** Create a concise summary explaining the personalization strategy based on the contact's role and company context. Focus on how their typical challenges connect to our solution. Do NOT mention that "no external research was provided" - instead, explain the strategic approach based on their role and industry.`;

  const formattedCsvData =
    contact.raw_data && Object.keys(contact.raw_data).length > 0
      ? Object.entries(contact.raw_data)
          .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n')
      : '- No additional CSV fields were provided.';

  const prompt = `
    You are an expert B2B Sales Development Representative specializing in crafting highly personalized cold emails that get replies.
    
    **Your Task:**
    Generate a personalized email and a research summary for a contact based on the provided campaign and contact information.

    **1. Campaign Context:**
    - **Messaging Angle:** ${campaignDetails.messaging_angle}
    - **Brand/Product Guidelines:** ${campaignDetails.product_guidelines}

    **2. Target Contact Information:**
    - **Name:** ${contact.firstName} ${contact.lastName}
    - **Title:** ${contact.title}
    - **Company:** ${contact.company}

    **3. Additional Contact Data from CSV Upload:**
    ${formattedCsvData}

    **4. External Research (verified facts only):**
    ${promptResearchSection}

    **5. Research Usage Rules (critical):**
    - Use ONLY the facts contained in section 4 (External Research). These were sourced from DataForSEO. 
    - Do NOT invent, hallucinate, or assume any additional details beyond what is explicitly provided.
    - If section 4 is empty, fall back to a strategy based on the contact's role/title and the campaign messaging, but state this clearly in your internal research summary (not in the email itself).

    **6. Instructions:**
    ${researchInstructions}
    - **Step C: Write Email:** Based on your research, write a short, compelling, and personalized cold email.
        - The subject line must be catchy and relevant.
        - The opening line must be highly personalized based on your research.
        - The body should connect their situation to our solution (based on the messaging angle and guidelines).
        - The call-to-action should be clear and low-friction (e.g., asking a question).
        - Keep the email concise (ideally under 120 words).
        - Do NOT include any footer, signature, or sender contact information—those are added automatically later.
        - Adhere strictly to the Brand/Product Guidelines.
        - The email should feel genuine and not like a template.

    **7. Output Format:**
    You MUST return your response as a JSON object that strictly follows the provided schema. Do not include any text outside of the JSON object, including markdown backticks.
  `;

  try {
    console.log('[Gemini] Generating email for contact', contact.email);
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: {
              type: Type.STRING,
              description: "The subject line of the email.",
            },
            body: {
              type: Type.STRING,
              description:
                "The full body of the email, including salutation and sign-off.",
            },
            researchSummary: {
              type: Type.STRING,
              description:
                "A summary of the research findings used to personalize the email.",
            }
          },
          required: ["subject", "body", "researchSummary"],
        },
      },
    });

    const parsedResponse = JSON.parse(response.text);
    const cleanedBody = stripEmailFooter(parsedResponse.body ?? '');
    console.log('[Gemini] Generation complete for', contact.email);

    // Combine research summary - only include verified sources if they exist
    let combinedResearchSummary = '';
    const aiSummary = parsedResponse.researchSummary?.trim() ?? '';
    
    if (researchPayload?.formattedSummary && researchPayload.formattedSummary.trim().length > 0) {
      // We have verified external research
      combinedResearchSummary = `Verified Sources:\n${researchPayload.formattedSummary}`;
      if (aiSummary) {
        combinedResearchSummary += `\n\n${aiSummary}`;
      }
    } else {
      // No external research - filter out messages about missing research
      if (aiSummary && 
          !aiSummary.toLowerCase().includes('no specific external research') && 
          !aiSummary.toLowerCase().includes('no external research was provided') &&
          !aiSummary.toLowerCase().includes('no verified research')) {
        combinedResearchSummary = aiSummary;
      } else {
        // Fallback: create a role-based summary
        combinedResearchSummary = `Personalization approach: Targeting ${contact.title} at ${contact.company} based on typical role challenges and how our solution addresses them.`;
      }
    }

    return {
      contact,
      subject: parsedResponse.subject,
      body: cleanedBody,
      researchSummary: combinedResearchSummary.trim(),
    };
  } catch (error) {
    console.error("Error generating email for", contact.email, error);
    throw new Error(`Failed to generate email for ${contact.email}.`);
  }
};