import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeJsonResponse(text: string) {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing GEMINI_API_KEY secret." }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        }
      );
    }

    const payload = await request.json();
    const userId = String(payload?.userId || "").trim();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized request." }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 401,
        }
      );
    }

    const categories = Array.isArray(payload?.categories) ? payload.categories : [];

    if (!payload?.imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing receipt image." }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 400,
        }
      );
    }

    const prompt = `
You are extracting transaction data from a receipt image for a personal finance app.

Read the receipt carefully and return JSON only.
Do not wrap the JSON in markdown.

Rules:
- type must be either "expense" or "income". For normal shopping receipts, use "expense".
- amount must be the final paid amount as a number without currency symbols.
- date must be in YYYY-MM-DD format if found. If unclear, use null.
- title should be a short human-readable transaction title.
- merchant should be the shop or business name if visible.
- suggestedCategoryName should match one of these category names when possible, otherwise null.
- rawText should be a short cleaned text extraction, not the full hallucinated receipt.

Available categories:
${JSON.stringify(categories)}

Return this exact JSON shape:
{
  "merchant": "string or null",
  "title": "string",
  "amount": 0,
  "date": "YYYY-MM-DD or null",
  "type": "expense",
  "suggestedCategoryName": "string or null",
  "rawText": "string"
}
`.trim();

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": geminiApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: payload?.mimeType || "image/jpeg",
                    data: payload.imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return new Response(
        JSON.stringify({
          error: data?.error?.message || "Gemini OCR request failed.",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        }
      );
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "No OCR result returned." }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 500,
        }
      );
    }

    const parsed = JSON.parse(sanitizeJsonResponse(rawText));

    return new Response(
      JSON.stringify({
        userId,
        merchant: parsed?.merchant || null,
        title: parsed?.title || parsed?.merchant || "Receipt transaction",
        amount: Number(parsed?.amount || 0),
        date: parsed?.date || null,
        type: parsed?.type === "income" ? "income" : "expense",
        suggestedCategoryName: parsed?.suggestedCategoryName || null,
        rawText: parsed?.rawText || "",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
