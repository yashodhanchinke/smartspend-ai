import './config.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { supabase } from './supabase.js';
import { generateAndSendReport } from './generateMonthlyReport.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Serve generated reports (PDFs) from /reports
app.use('/reports', express.static(path.join(process.cwd(), 'reports')));

app.post('/api/monthly-report', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token. ' + (error?.message || '') });
    }

    const { month, range_days, send_email, transactions, report_label } = req.body || {};
    if (!Array.isArray(transactions) && !month && !range_days) {
      return res
        .status(400)
        .json({ error: 'Missing transactions[] or month (YYYY-MM) or range_days (e.g. 30)' });
    }

    // Process the report async
    const result = await generateAndSendReport({
      userId: user.id,
      userEmail: user.email,
      month,
      rangeDays: range_days,
      transactionsOverride: Array.isArray(transactions) ? transactions : null,
      reportLabelOverride: report_label,
      sendEmail: Boolean(send_email)
    });

    const reportUrl = result?.filename ? `/reports/${result.filename}` : null;
    res.json({ success: true, report_url: reportUrl, ...result });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Backend running on port ${PORT}`);
});
