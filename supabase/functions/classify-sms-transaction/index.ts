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

type CategoryInput = { name?: string; type?: string };

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

    const message = String(payload?.message || "").trim();
    const sender = String(payload?.sender || "SMS").trim();
    const parsedType = String(payload?.parsed?.type || "").trim().toLowerCase();
    const parsedMerchant = String(payload?.parsed?.merchant || "").trim();
    const parsedAmount = Number(payload?.parsed?.amount || 0);

    const categories = (Array.isArray(payload?.categories) ? payload.categories : [])
      .map((item: CategoryInput) => ({
        name: String(item?.name || "").trim(),
        type: String(item?.type || "").trim().toLowerCase(),
      }))
      .filter((item) => item.name && item.type);

    if (!message || !parsedType || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid SMS classification payload." }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 400,
        }
      );
    }

    const categoriesForType = categories
      .filter((item) => item.type === parsedType)
      .map((item) => item.name);

    if (!categoriesForType.length) {
      return new Response(
        JSON.stringify({ suggestedCategoryName: null, confidence: 0 }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const prompt = `
You classify Indian bank transaction SMS into a user's existing categories.
Return JSON only. Never use markdown.

Rules:
- You MUST choose ONLY from the provided category names.
- If uncertain, return suggestedCategoryName as null.
- Prefer precision over guessing.
- Consider local merchant naming styles like cafe/chaha/chai/bhel/collection/store/mart.

Transaction details:
- sender: ${sender}
- message: ${message}
- merchant: ${parsedMerchant || "unknown"}
- amount: ${parsedAmount}
- type: ${parsedType}

Allowed category names (${parsedType} only):
${JSON.stringify(categoriesForType)}

Return exact JSON shape:
{
  "suggestedCategoryName": "string or null",
  "confidence": 0
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
              parts: [{ text: prompt }],
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
          error: data?.error?.message || "Gemini classification request failed.",
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
        JSON.stringify({ suggestedCategoryName: null, confidence: 0 }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const parsed = JSON.parse(sanitizeJsonResponse(rawText));
    const suggested = String(parsed?.suggestedCategoryName || "").trim();
    const confidence = Number(parsed?.confidence || 0);

    const validatedSuggestion = categoriesForType.find(
      (name) => name.toLowerCase() === suggested.toLowerCase()
    );

    return new Response(
      JSON.stringify({
        suggestedCategoryName: validatedSuggestion || null,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : 0,
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
