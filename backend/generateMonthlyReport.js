import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import puppeteer from 'puppeteer';
import './config.js';
import { supabaseAdmin } from './supabase.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const REPORTS_BUCKET = process.env.SUPABASE_REPORTS_BUCKET || 'reports';
const DEFAULT_TOKEN_CANDIDATES = [
  path.join(os.homedir(), '.config', 'smartspend-ai', 'gmail_token.json'),
  path.join('/tmp', 'smartspend-ai', 'gmail_token.json'),
];

function resolvePrimaryTokenPath() {
  if (process.env.GMAIL_TOKEN_PATH) return process.env.GMAIL_TOKEN_PATH;
  return DEFAULT_TOKEN_CANDIDATES[0];
}

function resolveReadableDefaultTokenPath() {
  for (const candidate of DEFAULT_TOKEN_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return resolvePrimaryTokenPath();
}

const PRIMARY_TOKEN_PATH = resolvePrimaryTokenPath();
const DEFAULT_TOKEN_PATH = resolveReadableDefaultTokenPath();
let sharedBrowser = null;

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000'
);

let hasAuth = false;

function tryLoadTokenFromFile(tokenPath, { label, warnIfLegacy } = {}) {
  if (!tokenPath || !fs.existsSync(tokenPath)) return false;
  try {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    oauth2Client.setCredentials(token);
    hasAuth = true;

    if (warnIfLegacy) {
      console.warn(`[Gmail] Using legacy token file at ${tokenPath}. Consider moving it to ${PRIMARY_TOKEN_PATH} and adding it to .gitignore.`);
    } else {
      console.info(`[Gmail] Using authentication from ${label || tokenPath}`);
    }
    return true;
  } catch (err) {
    console.warn(`[Gmail] Failed to parse token file at ${tokenPath}:`, err.message);
    return false;
  }
}

function ensureTokenDir(tokenPath) {
  const dir = path.dirname(tokenPath);
  fs.mkdirSync(dir, { recursive: true });
}

function persistTokenIfMissing(sourcePath) {
  if (!sourcePath || sourcePath === PRIMARY_TOKEN_PATH) return;
  if (!oauth2Client.credentials || Object.keys(oauth2Client.credentials).length === 0) return;
  try {
    if (fs.existsSync(PRIMARY_TOKEN_PATH)) return;
    ensureTokenDir(PRIMARY_TOKEN_PATH);
    fs.writeFileSync(PRIMARY_TOKEN_PATH, JSON.stringify(oauth2Client.credentials), 'utf-8');
    console.info(`[Gmail] Copied token to ${PRIMARY_TOKEN_PATH} for future runs.`);
  } catch (err) {
    console.warn('[Gmail] Failed to persist token to primary path:', err.message);
  }
}

// Priority 1: Explicit JSON via env (useful for CI/containers)
if (process.env.GMAIL_TOKEN_JSON) {
  try {
    oauth2Client.setCredentials(JSON.parse(process.env.GMAIL_TOKEN_JSON));
    hasAuth = true;
    console.info('[Gmail] Using authentication from GMAIL_TOKEN_JSON');
  } catch (err) {
    console.warn('[Gmail] Failed to parse GMAIL_TOKEN_JSON:', err.message);
  }
}

// Priority 2: Fallback to env-based refresh token
if (!hasAuth && process.env.GMAIL_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  hasAuth = true;
  console.info('[Gmail] Using authentication from environment variables');
}

// Priority 3: Token file outside the repo (default)
if (!hasAuth) {
  // Prefer explicit path, but also allow the default candidate that actually exists.
  if (!tryLoadTokenFromFile(PRIMARY_TOKEN_PATH, { label: 'GMAIL_TOKEN_PATH' })) {
    tryLoadTokenFromFile(DEFAULT_TOKEN_PATH, { label: 'default token path' });
  }
}

// Priority 4: Legacy in-repo paths (migration only)
if (!hasAuth) {
  const legacyCwdToken = path.join(process.cwd(), 'token.json');
  const legacyBackendToken = path.join(process.cwd(), 'backend', 'token.json');

  if (tryLoadTokenFromFile(legacyCwdToken, { warnIfLegacy: true })) persistTokenIfMissing(legacyCwdToken);
  else if (tryLoadTokenFromFile(legacyBackendToken, { warnIfLegacy: true })) persistTokenIfMissing(legacyBackendToken);
}

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

function sanitizeLabel(value, fallback = 'report') {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

function formatDateKey(date) {
  return new Date(date).toISOString().split('T')[0];
}

function getDateRangeForInputs({ month, rangeDays, customStartDate, customEndDate }) {
  if (customStartDate && customEndDate) {
    const parsedStart = new Date(customStartDate);
    const parsedEnd = new Date(customEndDate);

    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      throw new Error('Invalid custom date range.');
    }

    const start = new Date(Date.UTC(parsedStart.getUTCFullYear(), parsedStart.getUTCMonth(), parsedStart.getUTCDate()));
    const endInclusive = new Date(Date.UTC(parsedEnd.getUTCFullYear(), parsedEnd.getUTCMonth(), parsedEnd.getUTCDate()));
    const endExclusive = new Date(endInclusive);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    return {
      startDate: formatDateKey(start),
      endDate: formatDateKey(endExclusive),
      reportLabel: `custom-${formatDateKey(start)}-to-${formatDateKey(endInclusive)}`,
      displayLabel: `${formatDateKey(start)} to ${formatDateKey(endInclusive)}`,
    };
  }

  if (month) {
    const [yearStr, monthStr] = month.split('-');
    const startDate = `${month}-01`;
    const nextMonthDate = new Date(Date.UTC(parseInt(yearStr, 10), parseInt(monthStr, 10), 1));
    const endDate = formatDateKey(nextMonthDate);
    return {
      startDate,
      endDate,
      reportLabel: month,
      displayLabel: month,
    };
  }

  const days = Math.max(1, Math.min(365, Number(rangeDays || 30)));
  const today = new Date();
  const endExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  const startDateObj = new Date(endExclusive);
  startDateObj.setUTCDate(startDateObj.getUTCDate() - days);
  const endInclusive = new Date(endExclusive.getTime() - 86400000);
  const startDate = formatDateKey(startDateObj);
  const endDate = formatDateKey(endExclusive);

  return {
    startDate,
    endDate,
    reportLabel: `last-${days}-days-${startDate}-to-${formatDateKey(endInclusive)}`,
    displayLabel: `Last ${days} days`,
  };
}

async function generateInsightsJson({ prompt }) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const chatResult = await model.generateContent(prompt);
    const responseText = chatResult.response.text();

    const cleaned = String(responseText || '')
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (geminiError) {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw geminiError;

    const groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: groqModel,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'You are a financial assistant. Return ONLY raw JSON (no markdown) with keys: summary (string), tips (array of 3 strings).',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Groq error (${resp.status}): ${text}`);
    }

    const data = text ? JSON.parse(text) : null;
    const content = data?.choices?.[0]?.message?.content;
    return JSON.parse(String(content || '').trim());
  }
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

async function getSharedBrowser() {
  if (sharedBrowser) {
    return sharedBrowser;
  }

  sharedBrowser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return sharedBrowser;
}

function createRawMessage(to, subject, text, attachmentData, pdfName) {
  const boundary = `smartspend_boundary_${Date.now()}`;
  const sender = process.env.GMAIL_SENDER_ADDRESS || 'no-reply@smartspend.local';

  const parts = [
    `To: ${to}`,
    `From: SmartSpend AI <${sender}>`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary=${boundary}`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
  ];

  if (attachmentData) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: application/pdf; name="${pdfName}"`);
    parts.push(`Content-Disposition: attachment; filename="${pdfName}"`);
    parts.push('Content-Transfer-Encoding: base64');
    parts.push('');
    parts.push(Buffer.from(attachmentData).toString('base64'));
    parts.push('');
  }

  parts.push(`--${boundary}--`);

  return Buffer.from(parts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendPdfEmail({ pdfBuffer, toEmail, subject, text, attachmentName }) {
  if (!hasAuth) {
    throw new Error('Gmail API not configured. Set GMAIL_REFRESH_TOKEN in backend env.');
  }

  const rawMessage = createRawMessage(
    toEmail,
    subject || 'Your SmartSpend Report',
    text || 'Attached is your requested report PDF.',
    pdfBuffer,
    attachmentName || 'SmartSpend_Report.pdf'
  );

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rawMessage },
  });
}

async function uploadReportToStorage({ userId, filename, pdfBuffer }) {
  const safeUserId = sanitizeLabel(userId, 'user');
  const objectPath = `${safeUserId}/${Date.now()}-${sanitizeLabel(filename, 'report.pdf')}`;

  const { error } = await supabaseAdmin.storage
    .from(REPORTS_BUCKET)
    .upload(objectPath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  return objectPath;
}

async function createSignedReportUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabaseAdmin.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Could not create signed URL: ${error.message}`);
  }

  return data?.signedUrl || null;
}

async function fetchReportRecord({ reportId, filename, userId }) {
  let query = supabaseAdmin
    .from('user_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (reportId) {
    query = query.eq('id', reportId);
  } else if (filename) {
    query = query.eq('filename', filename);
  } else {
    throw new Error('Missing report identifier.');
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Could not load report metadata: ${error.message}`);
  }
  if (!data) {
    throw new Error('Report not found.');
  }

  return data;
}

async function storeReportMetadata({
  userId,
  emailTo,
  filename,
  storagePath,
  reportLabel,
  startDate,
  endDate,
  filtersSnapshot,
  summaryText,
  adviceText,
  emailStatus,
  isAutomatic,
  generatedForMonth,
}) {
  const payload = {
    user_id: userId,
    email_to: emailTo || null,
    filename,
    storage_path: storagePath,
    report_label: reportLabel || null,
    range_start: startDate || null,
    range_end: endDate ? formatDateKey(new Date(new Date(endDate).getTime() - 86400000)) : null,
    filter_snapshot: filtersSnapshot || {},
    summary_text: summaryText || null,
    advice_text: adviceText || null,
    email_status: emailStatus || 'skipped',
    is_automatic: Boolean(isAutomatic),
    generated_for_month: generatedForMonth || null,
    sent_at: emailStatus === 'success' ? new Date().toISOString() : null,
  };

  const { data, error } = await supabaseAdmin
    .from('user_reports')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Could not save report metadata: ${error.message}`);
  }

  return data;
}

function buildHtmlContent({
  month,
  rangeDays,
  totalIncome,
  totalSpending,
  highestCategory,
  transactions,
  transferTransactions,
  aiData,
  categoryBreakdown,
  topExpenseTransactions,
  topIncomeTransactions,
  recentTransactions,
}) {
  return `
  <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px; margin: 0 auto; background: #fff; padding: 40px; }
        .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        h1 { color: #2c1e1a; margin-bottom: 5px; }
        .subtitle { color: #777; font-size: 18px; }
        .summary-card { background: #f9f9f9; padding: 25px; border-radius: 12px; margin-bottom: 30px; border-left: 4px solid #ffcc99; }
        .metrics { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 16px; }
        .metric-box { background: #fff; border: 1px solid #eee; padding: 20px; border-radius: 8px; width: 45%; text-align: center; }
        .metric-val { font-size: 28px; font-weight: bold; color: #d35400; margin: 10px 0 0 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
        th { background: #fdfdfd; font-weight: 600; color: #555; }
        h2 { color: #2c1e1a; margin-top: 40px; font-size: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 10px; }
        .footer { text-align: center; font-size: 12px; color: #aaa; margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>SmartSpend Report</h1>
        <div class="subtitle">${month ? month : `Last ${Math.max(1, Math.min(365, Number(rangeDays || 30)))} days`}</div>
      </div>

      <div class="metrics">
        <div class="metric-box">
          <div>Total Income</div>
          <div class="metric-val">₹${totalIncome}</div>
        </div>
        <div class="metric-box">
          <div>Total Expense</div>
          <div class="metric-val">₹${totalSpending}</div>
        </div>
      </div>

      <div class="metrics">
        <div class="metric-box">
          <div>Net</div>
          <div class="metric-val">₹${totalIncome - totalSpending}</div>
        </div>
        <div class="metric-box">
          <div>Highest Spending Category</div>
          <div class="metric-val">${highestCategory.name}</div>
        </div>
      </div>

      <div class="metrics">
        <div class="metric-box">
          <div>Transactions</div>
          <div class="metric-val">${transactions.length}</div>
        </div>
        <div class="metric-box">
          <div>Transfers</div>
          <div class="metric-val">${transferTransactions.length}</div>
        </div>
      </div>

      <div class="summary-card">
        <strong>AI Insights:</strong> ${aiData.summary}
      </div>

      <h2>Actionable Advice</h2>
      <ul>
        ${aiData.tips.map((tip) => `<li>${tip}</li>`).join('')}
      </ul>

      <h2>Category Breakdown</h2>
      <table>
        <thead><tr><th>Category</th><th>Amount</th></tr></thead>
        <tbody>
          ${categoryBreakdown.map((item) => `<tr><td>${item.name}</td><td>₹${item.total}</td></tr>`).join('')}
        </tbody>
      </table>

      <h2>Top 5 Expenses</h2>
      <table>
        <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Account</th><th>Amount</th></tr></thead>
        <tbody>
          ${topExpenseTransactions.map((item) => `<tr><td>${item.date}</td><td>${item.title}</td><td>${item.category}</td><td>${item.account}</td><td>₹${item.amount}</td></tr>`).join('')}
        </tbody>
      </table>

      <h2>Top 5 Incomes</h2>
      <table>
        <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Account</th><th>Amount</th></tr></thead>
        <tbody>
          ${topIncomeTransactions.map((item) => `<tr><td>${item.date}</td><td>${item.title}</td><td>${item.category}</td><td>${item.account}</td><td>₹${item.amount}</td></tr>`).join('')}
        </tbody>
      </table>

      <h2>Recent 10 Transactions</h2>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Category</th><th>Account</th><th>To</th><th>Amount</th></tr></thead>
        <tbody>
          ${recentTransactions.map((item) => `<tr><td>${item.date}</td><td>${item.type}</td><td>${item.title}</td><td>${item.category}</td><td>${item.account}</td><td>${item.type === 'transfer' ? item.toAccount : '—'}</td><td>₹${item.amount}</td></tr>`).join('')}
        </tbody>
      </table>

      <div class="footer">
        Generated automatically by SmartSpend AI Backend.
      </div>
    </body>
  </html>
  `;
}

export async function listStoredReports({
  userId,
  limit = 10,
  generatedForMonth,
  automaticOnly = false,
}) {
  let query = supabaseAdmin
    .from('user_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (generatedForMonth) {
    query = query.eq('generated_for_month', generatedForMonth);
  }

  if (automaticOnly) {
    query = query.eq('is_automatic', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Could not load reports: ${error.message}`);
  }

  const reports = [];
  for (const item of data || []) {
    let reportUrl = null;
    try {
      reportUrl = await createSignedReportUrl(item.storage_path);
    } catch (signError) {
      console.warn('Could not sign stored report:', signError.message);
    }

    reports.push({
      id: item.id,
      filename: item.filename,
      label: item.report_label || item.filename,
      created_at: item.created_at,
      email_status: item.email_status,
      is_automatic: item.is_automatic,
      generated_for_month: item.generated_for_month,
      report_url: reportUrl,
      storage_path: item.storage_path,
    });
  }

  return reports;
}

export async function sendExistingPdfEmail({ reportId, filename, toEmail, subject, text, userId }) {
  if (!toEmail || typeof toEmail !== 'string') {
    throw new Error('Missing recipient email.');
  }

  const reportRecord = await fetchReportRecord({ reportId, filename, userId });
  const { data, error } = await supabaseAdmin.storage
    .from(REPORTS_BUCKET)
    .download(reportRecord.storage_path);

  if (error) {
    throw new Error(`Could not download report from Supabase storage: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const pdfBuffer = Buffer.from(arrayBuffer);

  await sendPdfEmail({
    pdfBuffer,
    toEmail: String(toEmail).trim(),
    subject: subject || 'Your SmartSpend Report',
    text: text || 'Attached is your report PDF from SmartSpend AI.',
    attachmentName: reportRecord.filename,
  });

  const { error: updateError } = await supabaseAdmin
    .from('user_reports')
    .update({
      email_to: String(toEmail).trim(),
      email_status: 'success',
      sent_at: new Date().toISOString(),
    })
    .eq('id', reportRecord.id);

  if (updateError) {
    console.warn('Could not update report email status:', updateError.message);
  }

  return { email_status: 'success', report_id: reportRecord.id };
}

export async function generateAndSendReport({
  userId,
  userEmail,
  month,
  rangeDays,
  customStartDate,
  customEndDate,
  accountIds = [],
  categoryIds = [],
  transactionsOverride,
  reportLabelOverride,
  sendEmail = false,
  emailToOverride,
  filtersSnapshot = {},
  isAutomatic = false,
  generatedForMonth,
}) {
  try {
    const { startDate, endDate, reportLabel, displayLabel } = getDateRangeForInputs({
      month,
      rangeDays,
      customStartDate,
      customEndDate,
    });

    let transactions = [];
    if (Array.isArray(transactionsOverride)) {
      transactions = transactionsOverride;
    } else {
      let transactionQuery = supabaseAdmin
        .from('transactions')
        .select(`
            *,
            categories(name,icon,color,type),
            to_account:to_account_id(name)
          `)
        .eq('user_id', userId)
        .gte('date', startDate)
        .lt('date', endDate)
        .order('date', { ascending: false })
        .order('time', { ascending: false });

      if (Array.isArray(accountIds) && accountIds.length) {
        transactionQuery = transactionQuery.in('account_id', accountIds);
      }

      if (Array.isArray(categoryIds) && categoryIds.length) {
        transactionQuery = transactionQuery.in('category_id', categoryIds);
      }

      const [{ data: transactionsRaw, error }, { data: accountRows, error: accountError }] =
        await Promise.all([
          transactionQuery,
          supabaseAdmin.from('accounts').select('id,name,type,color,icon').eq('user_id', userId),
        ]);

      if (error) throw error;
      if (accountError) throw accountError;

      const accountMap = Object.fromEntries((accountRows || []).map((account) => [account.id, account]));
      transactions = (transactionsRaw || []).map((transaction) => ({
        ...transaction,
        account: accountMap[transaction.account_id] || null,
      }));
    }

    const expenseTransactions = transactions.filter((item) => item.type === 'expense');
    const incomeTransactions = transactions.filter((item) => item.type === 'income');
    const transferTransactions = transactions.filter((item) => item.type === 'transfer');

    let totalSpending = 0;
    let totalIncome = 0;
    const categoryMap = {};

    expenseTransactions.forEach((item) => {
      const amount = Number(item.amount || 0);
      totalSpending += amount;
      const categoryName = item.categories?.name || 'Uncategorized';
      categoryMap[categoryName] = (categoryMap[categoryName] || 0) + amount;
    });

    incomeTransactions.forEach((item) => {
      totalIncome += Number(item.amount || 0);
    });

    const categoryBreakdown = Object.keys(categoryMap)
      .map((name) => ({ name, total: categoryMap[name] }))
      .sort((left, right) => right.total - left.total);

    const highestCategory = categoryBreakdown[0] || { name: 'None', total: 0 };

    const topExpenseTransactions = [...expenseTransactions]
      .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))
      .slice(0, 5)
      .map((item) => ({
        amount: item.amount,
        title: item.title || item.categories?.name || 'Expense',
        date: item.date,
        category: item.categories?.name || 'Uncategorized',
        account: item.account?.name || '—',
      }));

    const topIncomeTransactions = [...incomeTransactions]
      .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))
      .slice(0, 5)
      .map((item) => ({
        amount: item.amount,
        title: item.title || item.categories?.name || 'Income',
        date: item.date,
        category: item.categories?.name || 'Uncategorized',
        account: item.account?.name || '—',
      }));

    const recentTransactions = [...transactions]
      .slice(0, 10)
      .map((item) => ({
        type: item.type,
        amount: item.amount,
        title: item.title || item.categories?.name || 'Transaction',
        date: item.date,
        category: item.categories?.name || (item.type === 'transfer' ? 'Transfer' : 'Uncategorized'),
        account: item.account?.name || '—',
        toAccount: item.to_account?.name || '—',
      }));

    let aiData = null;
    if (transactions.length === 0) {
      aiData = {
        summary: `No expenses were recorded for ${month ? `the month of ${month}` : displayLabel.toLowerCase()}. Great job keeping spending at zero!`,
        tips: [
          'Keep tracking transactions regularly to maintain visibility.',
          'Set a small savings goal to stay consistent.',
          'Review subscriptions to ensure nothing unexpected appears.',
        ],
      };
    } else {
      const prompt = `
        You are an expert AI financial advisor. Review this user's transactions for ${month ? `the month of ${month}` : displayLabel.toLowerCase()}.
        Total Income: ₹${totalIncome}
        Total Expense: ₹${totalSpending}
        Expense Categories: ${JSON.stringify(categoryBreakdown)}
        Top Expense Transactions: ${JSON.stringify(topExpenseTransactions)}
        Top Income Transactions: ${JSON.stringify(topIncomeTransactions)}

        Provide the response in raw JSON format without markdown wrapping, with exactly these two keys:
        {
          "summary": "A friendly 2-3 sentence summary of their spending habits.",
          "tips": ["Tip 1", "Tip 2", "Tip 3"]
        }
        Focus on actionable advice (e.g., reducing overspending, saving tips). Use ₹ for currency.
      `;

      try {
        aiData = await withTimeout(generateInsightsJson({ prompt }), 12000, 'AI insights');
      } catch (aiError) {
        console.error('AI insights generation error:', aiError);
        aiData = {
          summary: 'Here is your spending summary.',
          tips: ['Keep track of your budget!', 'Review recurring expenses.', 'Set a savings target for next month.'],
        };
      }
    }

    const htmlContent = buildHtmlContent({
      month,
      rangeDays,
      totalIncome,
      totalSpending,
      highestCategory,
      transactions,
      transferTransactions,
      aiData,
      categoryBreakdown,
      topExpenseTransactions,
      topIncomeTransactions,
      recentTransactions,
    });

    const browser = await getSharedBrowser();
    const page = await browser.newPage();
    let pdfBuffer;
    try {
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
      pdfBuffer = Buffer.from(
        await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: false,
          margin: { top: '16mm', right: '16mm', bottom: '16mm', left: '16mm' },
        })
      );
    } finally {
      await page.close();
    }

    const safeUserId = sanitizeLabel(userId, 'user');
    const safeLabel = sanitizeLabel(reportLabelOverride || reportLabel, 'report');
    const filename = `report-${safeUserId}-${safeLabel}.pdf`;
    const recipientEmail = String(emailToOverride || userEmail || '').trim();
    const uploadPromise = uploadReportToStorage({ userId, filename, pdfBuffer });
    const emailPromise =
      sendEmail && recipientEmail
        ? withTimeout(
            sendPdfEmail({
              pdfBuffer,
              toEmail: recipientEmail,
              subject: `Your SmartSpend Report - ${displayLabel}`,
              text: `Hi,\n\nPlease find attached your SmartSpend report for ${displayLabel}.\n\nAI Insights:\n${aiData.summary}\n\nBest,\nSmartSpend AI`,
              attachmentName: filename,
            }),
            20000,
            'Email send'
          )
        : Promise.resolve();

    const [storagePath] = await Promise.all([uploadPromise, emailPromise]);
    const emailStatus = sendEmail && recipientEmail ? 'success' : 'skipped';

    const reportRecord = await storeReportMetadata({
      userId,
      emailTo: recipientEmail || null,
      filename,
      storagePath,
      reportLabel: reportLabelOverride || reportLabel,
      startDate,
      endDate,
      filtersSnapshot,
      summaryText: aiData.summary,
      adviceText: (aiData.tips || []).join(' | '),
      emailStatus,
      isAutomatic,
      generatedForMonth: generatedForMonth || month || null,
    });

    return {
      report_id: reportRecord.id,
      report_url: await createSignedReportUrl(storagePath),
      filename,
      email_status: emailStatus,
      summary_text: aiData.summary,
      advice_text: (aiData.tips || []).join(' | '),
      created_at: reportRecord.created_at,
      is_automatic: reportRecord.is_automatic,
    };
  } catch (error) {
    console.error('Report generation failed:', error);
    throw error;
  }
}
