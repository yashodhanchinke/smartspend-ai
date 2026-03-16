Deploy the analytics summary function with Supabase CLI.

Required secret:
- `GEMINI_API_KEY`

Store it in your project `.env` file first:

```bash
GEMINI_API_KEY=YOUR_AI_KEY
```

Commands:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
source .env
supabase secrets set GEMINI_API_KEY="$GEMINI_API_KEY"
supabase functions deploy generate-analytics-summary
```

After deploy, the app will call:
- `generate-analytics-summary`
- `scan-receipt-ocr`

Notes:
- The mobile app does not expose the AI key directly.
- The user must be authenticated because the function is configured with `verify_jwt = true`.

Receipt OCR deploy:

```bash
supabase functions deploy scan-receipt-ocr
```
