import './config.js';
import express from 'express';
import cors from 'cors';
import { supabase } from './supabase.js';
import {
  generateAndSendReport,
  listStoredReports,
  sendExistingPdfEmail,
} from './generateMonthlyReport.js';
import { startMonthlyReportScheduler } from './reportScheduler.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

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

    const {
      month,
      range_days,
      send_email,
      email_to,
      transactions,
      report_label,
      filters,
      is_automatic,
      generated_for_month,
    } = req.body || {};

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
      sendEmail: Boolean(send_email),
      emailToOverride: String(email_to || '').trim() || user.email,
      filtersSnapshot: filters || {},
      isAutomatic: Boolean(is_automatic),
      generatedForMonth: generated_for_month || month || null,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/reports', async (req, res) => {
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

    const reports = await listStoredReports({ userId: user.id, limit: 10 });
    res.json({ success: true, reports });
  } catch (err) {
    console.error('Reports list error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/email-report', async (req, res) => {
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

    const { report_id, filename, email_to } = req.body || {};
    if ((!report_id && !filename) || !email_to) {
      return res.status(400).json({ error: 'Missing report_id/filename or email_to' });
    }

    const result = await sendExistingPdfEmail({
      reportId: report_id || null,
      filename,
      toEmail: String(email_to).trim(),
      subject: 'Your SmartSpend Report',
      text: 'Attached is your report PDF from SmartSpend AI.',
      userId: user.id,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Email report error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Backend running on port ${PORT}`);
  startMonthlyReportScheduler();
});
