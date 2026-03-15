import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing GEMINI_API_KEY secret.",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const payload = await request.json();
    const prompt = `
You are writing a short spending report for a personal budgeting app.

Write exactly 3 lines.
Each line must be short, direct, and useful.
Do not use markdown headings.
Do not mention raw JSON.
Do not say "based on the data provided".
Use Indian rupee formatting with the rupee symbol.
Keep the tone practical and human, like an in-app finance assistant.

Line 1:
Summarize current month spending versus the 6-month average and say whether spending is above, below, or near normal.

Line 2:
Mention the top spending category and why it matters. If category concentration is high, point it out.

Line 3:
Give one specific next step the user can take this month to stay in control.

If data is sparse, still give a useful simple summary without sounding robotic.

Analytics data:
${JSON.stringify(payload)}
`.trim();

    const response = await fetch(
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
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: data?.error?.message || "AI provider request failed.",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!summary) {
      return new Response(
        JSON.stringify({
          error: "No report text was returned by the AI provider.",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const cleanedSummary = summary
      .split("\n")
      .map((line) => line.replace(/^[-*•\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("\n");

    return new Response(JSON.stringify({ summary: cleanedSummary || summary.trim() }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
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
      }
    );
  }
});
