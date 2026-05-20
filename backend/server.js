import './config.js';
import express from 'express';
import cors from 'cors';
import { supabase } from './supabase.js';
import {
  generateAndSendReport,
  listStoredReports,
  sendExistingPdfEmail,
} from './generateMonthlyReport.js';
import {
  generateNotificationsForUser,
  registerNotificationDevice,
  analyzeSmsWithAi,
} from './notifications.js';
import { startMonthlyReportScheduler } from './reportScheduler.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'smartspend-backend' });
});

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
      custom_start_date,
      custom_end_date,
      account_ids,
      category_ids,
      send_email,
      email_to,
      transactions,
      report_label,
      filters,
      is_automatic,
      generated_for_month,
    } = req.body || {};

    if (
      !Array.isArray(transactions) &&
      !month &&
      !range_days &&
      !(custom_start_date && custom_end_date)
    ) {
      return res
        .status(400)
        .json({
          error:
            'Missing transactions[] or month (YYYY-MM) or range_days (e.g. 30) or custom_start_date/custom_end_date',
        });
    }

    const requestInput = {
      userId: user.id,
      userEmail: user.email,
      month,
      rangeDays: range_days,
      customStartDate: custom_start_date,
      customEndDate: custom_end_date,
      accountIds: Array.isArray(account_ids) ? account_ids : [],
      categoryIds: Array.isArray(category_ids) ? category_ids : [],
      transactionsOverride: Array.isArray(transactions) ? transactions : null,
      reportLabelOverride: report_label,
      sendEmail: Boolean(send_email),
      emailToOverride: String(email_to || '').trim() || user.email,
      filtersSnapshot: filters || {},
      isAutomatic: Boolean(is_automatic),
      generatedForMonth: generated_for_month || month || null,
    };

    if (Boolean(send_email)) {
      generateAndSendReport(requestInput).catch((backgroundError) => {
        console.error('Background report email job failed:', backgroundError);
      });

      return res.status(202).json({
        success: true,
        queued: true,
        email_status: 'queued',
      });
    }

    const result = await generateAndSendReport(requestInput);
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

    const reports = await listStoredReports({ userId: user.id, limit: 50 });
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

app.post('/api/notifications/register-device', async (req, res) => {
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

    const { expo_push_token, push_permission_status, language_mode } = req.body || {};
    const result = await registerNotificationDevice({
      userId: user.id,
      expoPushToken: expo_push_token || null,
      permissionStatus: push_permission_status || 'unknown',
      languageMode: language_mode || 'hinglish',
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Notification device registration error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/notifications/generate', async (req, res) => {
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

    const { force } = req.body || {};
    const result = await generateNotificationsForUser({
      userId: user.id,
      force: Boolean(force),
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Notification generation error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// NEW: AI SMS Analyzer for Bank Detection
app.post('/api/sms/analyze', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { sender, message } = req.body || {};
    if (!sender || !message) {
      return res.status(400).json({ error: 'Missing sender or message' });
    }

    const result = await analyzeSmsWithAi({ sender, message });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('SMS AI analysis error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Backend running on port ${PORT}`);
  startMonthlyReportScheduler();
});
