import { GoogleGenerativeAI } from '@google/generative-ai';
import puppeteer from 'puppeteer';
import './config.js';
import { supabaseAdmin } from './supabase.js';
import nodemailer from 'nodemailer';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const REPORTS_BUCKET = process.env.SUPABASE_REPORTS_BUCKET || 'reports';
let sharedBrowser = null;

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrencyValue(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function getMonthDays(startDate, endDate) {
  const days = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (current < end) {
    days.push(formatDateKey(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

function buildDailySeries(transactions, startDate, endDate) {
  const dayKeys = getMonthDays(startDate, endDate);
  const dayMap = new Map(dayKeys.map((key) => [key, { date: key, income: 0, expense: 0, transfer: 0 }]));

  (transactions || []).forEach((transaction) => {
    const key = formatDateKey(transaction.date);
    const bucket = dayMap.get(key);
    if (!bucket) {
      return;
    }

    const amount = Number(transaction.amount || 0);
    if (transaction.type === 'income') {
      bucket.income += amount;
    } else if (transaction.type === 'expense') {
      bucket.expense += amount;
    } else if (transaction.type === 'transfer') {
      bucket.transfer += amount;
    }
  });

  return dayKeys.map((key) => dayMap.get(key));
}

function buildCategorySeries(expenseTransactions, limit = 6) {
  const totals = new Map();

  (expenseTransactions || []).forEach((transaction) => {
    const name = transaction.categories?.name || 'Uncategorized';
    totals.set(name, (totals.get(name) || 0) + Number(transaction.amount || 0));
  });

  return [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((left, right) => right.total - left.total)
    .slice(0, limit);
}

function buildSavingsSuggestions({ totalIncome, totalSpending, categoryBreakdown, dailySeries, transactions }) {
  const suggestions = [];
  const savings = totalIncome - totalSpending;
  const savingsRate = totalIncome > 0 ? savings / totalIncome : 0;
  const topCategory = categoryBreakdown[0];
  const topCategoryShare = totalSpending > 0 && topCategory ? topCategory.total / totalSpending : 0;
  const recurringCount = (transactions || []).filter((item) => item.type === 'transfer').length;
  const avgDailyExpense =
    dailySeries.length > 0 ? dailySeries.reduce((sum, item) => sum + Number(item.expense || 0), 0) / dailySeries.length : 0;
  const volatileDays = dailySeries.filter((item) => Number(item.expense || 0) > avgDailyExpense * 1.5 && Number(item.expense || 0) > 0).length;

  if (totalIncome <= 0) {
    suggestions.push('No income entries found for this period. Add income transactions to measure savings more accurately.');
  } else if (savingsRate < 0.1) {
    suggestions.push('Your savings rate is below 10%. Try setting a fixed transfer to savings right after salary day.');
  } else if (savingsRate < 0.2) {
    suggestions.push('Your savings rate is healthy but can improve. Aim to lock 20% before non-essential spending starts.');
  } else {
    suggestions.push('Your savings rate looks strong. Keep the same discipline and protect it from impulse categories.');
  }

  if (topCategory && topCategoryShare >= 0.35) {
    suggestions.push(`The ${topCategory.name} category uses ${Math.round(topCategoryShare * 100)}% of total spending. Set a category cap and review it weekly.`);
  }

  if (volatileDays >= 3) {
    suggestions.push('Spending is uneven across the month. A daily spending cap can help flatten the spikes.');
  }

  if (recurringCount >= 5) {
    suggestions.push('You have many transfer entries this month. Review recurring items to make sure each one is still necessary.');
  }

  if (suggestions.length < 3) {
    suggestions.push('Track at least one non-essential category each week and cut one recurring avoidable expense.');
    suggestions.push('Before any purchase above your usual daily spend, pause for 10 minutes and compare it with your monthly goal.');
  }

  return suggestions.slice(0, 4);
}

function buildBarSvg({ bars, width = 720, height = 180, maxValue, leftLabel, rightLabel, seriesLabelA, seriesLabelB, colorA, colorB }) {
  const padding = { top: 20, right: 20, bottom: 34, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const actualMax = Math.max(maxValue || 0, 1);
  const step = bars.length > 0 ? innerWidth / bars.length : innerWidth;
  const barWidth = Math.max(3, Math.min(18, step * 0.36));
  const gap = Math.max(2, step * 0.08);

  const groupedBars = bars.map((bar, index) => {
    const x = padding.left + index * step;
    const expenseHeight = (Number(bar.expense || 0) / actualMax) * innerHeight;
    const incomeHeight = (Number(bar.income || 0) / actualMax) * innerHeight;
    const expenseY = padding.top + innerHeight - expenseHeight;
    const incomeY = padding.top + innerHeight - incomeHeight;
    const center = x + step / 2;

    return `
      <g>
        <rect x="${center - barWidth - gap / 2}" y="${expenseY}" width="${barWidth}" height="${expenseHeight}" rx="4" fill="${colorA}" />
        <rect x="${center + gap / 2}" y="${incomeY}" width="${barWidth}" height="${incomeHeight}" rx="4" fill="${colorB}" />
        <text x="${center}" y="${padding.top + innerHeight + 16}" text-anchor="middle" font-size="9" fill="#7b6f69">${escapeHtml(bar.label)}</text>
      </g>
    `;
  }).join('');

  const gridLines = [0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padding.top + innerHeight - innerHeight * ratio;
      const value = Math.round(actualMax * ratio);
      return `
        <g>
          <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#f0e6dd" stroke-width="1" />
          <text x="10" y="${y + 3}" font-size="9" fill="#9d8d85">${value}</text>
        </g>
      `;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${escapeHtml(seriesLabelA)} and ${escapeHtml(seriesLabelB)} chart">
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fffaf7" />
      ${gridLines}
      <line x1="${padding.left}" y1="${padding.top + innerHeight}" x2="${width - padding.right}" y2="${padding.top + innerHeight}" stroke="#d8cbc0" stroke-width="1.2" />
      ${groupedBars}
      <g>
        <rect x="${padding.left}" y="4" width="12" height="12" rx="3" fill="${colorA}" />
        <text x="${padding.left + 18}" y="14" font-size="11" fill="#4a3b35">${escapeHtml(seriesLabelA)}</text>
        <rect x="${padding.left + 120}" y="4" width="12" height="12" rx="3" fill="${colorB}" />
        <text x="${padding.left + 138}" y="14" font-size="11" fill="#4a3b35">${escapeHtml(seriesLabelB)}</text>
      </g>
      <text x="${width - padding.right}" y="14" text-anchor="end" font-size="11" fill="#8d7f76">${escapeHtml(rightLabel || '')}</text>
      <text x="${padding.left}" y="14" font-size="11" fill="#8d7f76">${escapeHtml(leftLabel || '')}</text>
    </svg>
  `;
}

function buildCategoryBarSvg(categories, width = 720, height = 220) {
  const padding = { top: 20, right: 20, bottom: 16, left: 150 };
  const innerWidth = width - padding.left - padding.right;
  const rowHeight = 28;
  const maxValue = Math.max(...categories.map((item) => Number(item.total || 0)), 1);

  const rows = categories.map((item, index) => {
    const y = padding.top + index * rowHeight;
    const barWidth = (Number(item.total || 0) / maxValue) * innerWidth;
    return `
      <g>
        <text x="${padding.left - 12}" y="${y + 14}" text-anchor="end" font-size="11" fill="#4a3b35">${escapeHtml(item.name)}</text>
        <rect x="${padding.left}" y="${y + 4}" width="${innerWidth}" height="14" rx="7" fill="#f1e7df" />
        <rect x="${padding.left}" y="${y + 4}" width="${Math.max(8, barWidth)}" height="14" rx="7" fill="#f39b6d" />
        <text x="${padding.left + Math.max(8, barWidth) + 8}" y="${y + 14}" font-size="10" fill="#8d7f76">${formatCurrencyValue(item.total)}</text>
      </g>
    `;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Category breakdown chart">
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fffaf7" />
      ${rows}
    </svg>
  `;
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

async function sendPdfEmail({ pdfBuffer, toEmail, subject, text, attachmentName }) {
  const brevoKey = process.env.BREVO_SMTP_KEY || '';
  const brevoLogin = process.env.BREVO_SMTP_LOGIN || '';
  const brevoPassword = process.env.BREVO_SMTP_PASSWORD || '';
  const mailFrom = process.env.EMAIL_FROM || 'no-reply@smartspend.local';

  if (!(brevoKey || (brevoLogin && brevoPassword))) {
    throw new Error('Email not configured. Set BREVO_SMTP_KEY or BREVO_SMTP_LOGIN/BREVO_SMTP_PASSWORD in backend env.');
  }

  const smtpUser = brevoLogin || 'apikey';
  const smtpPass = brevoPassword || brevoKey;

  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  await transporter.sendMail({
    from: mailFrom,
    to: toEmail,
    subject: subject || 'Your SmartSpend Report',
    text: text || 'Attached is your requested report PDF.',
    attachments: [
      {
        filename: attachmentName || 'SmartSpend_Report.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
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
  dailySeries,
  savingsSuggestions,
  orderedTransactions,
  topExpenseTransactions,
  topIncomeTransactions,
  recentTransactions,
}) {
  const safeMonthLabel = escapeHtml(month ? month : `Last ${Math.max(1, Math.min(365, Number(rangeDays || 30)))} days`);
  const incomeText = formatCurrencyValue(totalIncome);
  const expenseText = formatCurrencyValue(totalSpending);
  const netText = formatCurrencyValue(totalIncome - totalSpending);
  const categoryChart = buildCategoryBarSvg(categoryBreakdown.slice(0, 6));
  const trendChart = buildBarSvg({
    bars: dailySeries.map((item) => ({
      label: new Date(`${item.date}T00:00:00.000Z`).getDate(),
      income: item.income,
      expense: item.expense,
    })),
    maxValue: Math.max(
      ...dailySeries.flatMap((item) => [Number(item.income || 0), Number(item.expense || 0)]),
      0
    ),
    leftLabel: 'Month start',
    rightLabel: 'Month end',
    seriesLabelA: 'Expense',
    seriesLabelB: 'Income',
    colorA: '#f36f75',
    colorB: '#63c98b',
  });

  return `
  <html>
    <head>
      <style>
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #2f1f1a; line-height: 1.55; max-width: 920px; margin: 0 auto; background: #fffaf7; padding: 0; }
        .shell { background: linear-gradient(180deg, #fffaf7 0%, #fff 24%, #fff 100%); padding: 28px; }
        .header { background: linear-gradient(135deg, #2b1b17 0%, #4c2f25 55%, #7d4b39 100%); color: #fff; border-radius: 22px; padding: 28px; margin-bottom: 22px; box-shadow: 0 18px 36px rgba(43, 27, 23, 0.16); }
        .header h1 { margin: 0; font-size: 30px; letter-spacing: 0.2px; }
        .subtitle { color: rgba(255,255,255,0.84); font-size: 16px; margin-top: 8px; }
        .section { margin-top: 24px; }
        .section-title { color: #2c1e1a; margin: 0 0 12px; font-size: 20px; border-bottom: 1px solid #edded3; padding-bottom: 10px; }
        .summary-card { background: #fff; padding: 20px; border-radius: 16px; margin-bottom: 18px; border: 1px solid #eadfd7; box-shadow: 0 8px 18px rgba(68, 40, 30, 0.04); }
        .metrics { display: flex; justify-content: space-between; margin-bottom: 14px; gap: 16px; flex-wrap: wrap; }
        .metric-box { background: #fff; border: 1px solid #eadfd7; padding: 18px; border-radius: 16px; width: calc(50% - 8px); text-align: center; box-shadow: 0 8px 18px rgba(68, 40, 30, 0.04); }
        .metric-box.full { width: 100%; }
        .metric-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #8b7368; }
        .metric-val { font-size: 28px; font-weight: 800; color: #d35400; margin: 8px 0 0 0; }
        .metric-sub { color: #8f7d73; font-size: 12px; margin-top: 6px; }
        .chart-card { background: #fff; border: 1px solid #eadfd7; border-radius: 18px; padding: 18px; box-shadow: 0 8px 18px rgba(68, 40, 30, 0.04); }
        .chart-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
        .insight-list { padding-left: 18px; margin: 10px 0 0; }
        .insight-list li { margin-bottom: 10px; }
        .suggestion-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .suggestion-box { background: linear-gradient(180deg, #fff 0%, #fff9f3 100%); border: 1px solid #efd9c8; border-radius: 16px; padding: 16px; }
        .suggestion-badge { display: inline-block; background: #2c1e1a; color: #fff; border-radius: 999px; padding: 4px 10px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px; }
        .suggestion-box p { margin: 0; color: #4b3a34; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; background: #fff; border-radius: 16px; overflow: hidden; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #f0e6dd; vertical-align: top; }
        th { background: #fbf5f0; font-weight: 700; color: #5c4a43; }
        tbody tr:nth-child(even) { background: #fffaf7; }
        .compact-note { color: #806f66; font-size: 12px; margin-top: 8px; }
        .footer { text-align: center; font-size: 12px; color: #9d8f87; margin-top: 42px; border-top: 1px solid #edded3; padding-top: 18px; }
        .page-break { break-before: page; page-break-before: always; }
      </style>
    </head>
    <body>
      <div class="shell">
        <div class="header">
          <h1>SmartSpend Report</h1>
          <div class="subtitle">${safeMonthLabel}</div>
        </div>

        <div class="metrics">
          <div class="metric-box">
            <div class="metric-label">Total Income</div>
            <div class="metric-val">${incomeText}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Total Expense</div>
            <div class="metric-val">${expenseText}</div>
          </div>
        </div>

        <div class="metrics">
          <div class="metric-box">
            <div class="metric-label">Net</div>
            <div class="metric-val">${netText}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Highest Spending Category</div>
            <div class="metric-val">${escapeHtml(highestCategory.name)}</div>
          </div>
        </div>

        <div class="metrics">
          <div class="metric-box">
            <div class="metric-label">Transactions</div>
            <div class="metric-val">${transactions.length}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Transfers</div>
            <div class="metric-val">${transferTransactions.length}</div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">AI Insights</h2>
          <div class="summary-card">${escapeHtml(aiData.summary)}</div>
        </div>

        <div class="section">
          <h2 class="section-title">Saving Suggestions</h2>
          <div class="suggestion-grid">
            ${savingsSuggestions
              .map(
                (tip, index) => `
                  <div class="suggestion-box">
                    <div class="suggestion-badge">Tip ${index + 1}</div>
                    <p>${escapeHtml(tip)}</p>
                  </div>
                `
              )
              .join('')}
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Monthly Trend Chart</h2>
          <div class="chart-card">${trendChart}</div>
          <div class="compact-note">Expense bars and income bars show the full month day by day.</div>
        </div>

        <div class="section">
          <h2 class="section-title">Category Breakdown</h2>
          <div class="chart-card">${categoryChart}</div>
        </div>

        <div class="section">
          <h2 class="section-title">Category Breakdown Table</h2>
          <table>
            <thead><tr><th>Category</th><th>Amount</th></tr></thead>
            <tbody>
              ${categoryBreakdown.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${formatCurrencyValue(item.total)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2 class="section-title">Top 5 Expenses</h2>
          <table>
            <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Account</th><th>Amount</th></tr></thead>
            <tbody>
              ${topExpenseTransactions.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.account)}</td><td>${formatCurrencyValue(item.amount)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2 class="section-title">Top 5 Incomes</h2>
          <table>
            <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Account</th><th>Amount</th></tr></thead>
            <tbody>
              ${topIncomeTransactions.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.account)}</td><td>${formatCurrencyValue(item.amount)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2 class="section-title">Recent 10 Transactions</h2>
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Category</th><th>Account</th><th>To</th><th>Amount</th></tr></thead>
            <tbody>
              ${recentTransactions.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.account)}</td><td>${escapeHtml(item.type === 'transfer' ? item.toAccount : '—')}</td><td>${formatCurrencyValue(item.amount)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="page-break section">
          <h2 class="section-title">All Month Transactions</h2>
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Category</th><th>Account</th><th>To</th><th>Amount</th></tr></thead>
            <tbody>
              ${orderedTransactions.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.title || item.categories?.name || 'Transaction')}</td><td>${escapeHtml(item.categories?.name || (item.type === 'transfer' ? 'Transfer' : 'Uncategorized'))}</td><td>${escapeHtml(item.account?.name || '—')}</td><td>${escapeHtml(item.type === 'transfer' ? item.to_account?.name || '—' : '—')}</td><td>${formatCurrencyValue(item.amount)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="footer">
          Generated automatically by SmartSpend AI Backend.
        </div>
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

  const reports = await Promise.all(
    (data || []).map(async (item) => {
      let reportUrl = null;
      try {
        reportUrl = await createSignedReportUrl(item.storage_path);
      } catch (signError) {
        console.warn('Could not sign stored report:', signError.message);
      }

      return {
        id: item.id,
        filename: item.filename,
        label: item.report_label || item.filename,
        created_at: item.created_at,
        email_status: item.email_status,
        is_automatic: item.is_automatic,
        generated_for_month: item.generated_for_month,
        report_url: reportUrl,
        storage_path: item.storage_path,
      };
    })
  );

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

    const orderedTransactions = [...transactions].sort((left, right) => {
      const dateDiff = new Date(right.date).getTime() - new Date(left.date).getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }

      return String(right.time || '').localeCompare(String(left.time || ''));
    });
    const expenseTransactions = orderedTransactions.filter((item) => item.type === 'expense');
    const incomeTransactions = orderedTransactions.filter((item) => item.type === 'income');
    const transferTransactions = orderedTransactions.filter((item) => item.type === 'transfer');

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
    const dailySeries = buildDailySeries(orderedTransactions, startDate, endDate);
    const savingsSuggestions = buildSavingsSuggestions({
      totalIncome,
      totalSpending,
      categoryBreakdown,
      dailySeries,
      transactions: orderedTransactions,
    });

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

    const recentTransactions = [...orderedTransactions]
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
      dailySeries,
      savingsSuggestions,
      transferTransactions,
      aiData,
      categoryBreakdown,
      orderedTransactions,
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
