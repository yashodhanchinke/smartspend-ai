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
- `classify-sms-transaction`

Notes:
- The mobile app does not expose the AI key directly.
- The app sends `userId` in function payloads; keep function access restricted to trusted app clients.

Receipt OCR deploy:

```bash
supabase functions deploy scan-receipt-ocr
```

SMS category classifier deploy:

```bash
supabase functions deploy classify-sms-transaction
```
