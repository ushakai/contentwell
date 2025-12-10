
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== "string") {
            return res.status(400).json({ error: "Invalid prompt" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "GEMINI_API_KEY missing" });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "image/png",
                    },
                }),
            }
        );

        if (!response.ok) {
            const err = await response.text();
            console.error("Gemini API error:", err);
            return res.status(502).json({ error: "Failed to reach Gemini" });
        }

        const data = await response.json();
        const base64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!base64) {
            return res.status(500).json({ error: "No image returned" });
        }

        return res.status(200).json({
            image: `data:image/png;base64,${base64}`,
        });
    } catch (err: any) {
        console.error("Image generation crash:", err);
        return res.status(500).json({ error: err.message || "Server error" });
    }
}
