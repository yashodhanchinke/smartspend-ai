import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { google } from 'googleapis';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import './config.js';
import { supabase } from './supabase.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
);

let hasAuth = false;
try {
  // Prefer drop-in token.json next to this file: backend/token.json
  const tokenPath = path.join(__dirname, 'token.json');
  const tokenContent = fs.readFileSync(tokenPath);
  oauth2Client.setCredentials(JSON.parse(tokenContent));
  hasAuth = true;
} catch (err) {
  if (process.env.GMAIL_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    hasAuth = true;
  }
}

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

async function generateInsightsJson({ prompt }) {
  // 1) Try Gemini first
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const chatResult = await model.generateContent(prompt);
    const responseText = chatResult.response.text();

    const cleaned = String(responseText || '')
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (geminiError) {
    // 2) Fallback to Groq (if configured)
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw geminiError;

    const groqModel = process.env.GROQ_MODEL || "llama-3.1-70b-versatile";
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: groqModel,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are a financial assistant. Return ONLY raw JSON (no markdown) with keys: summary (string), tips (array of 3 strings).",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Groq error (${resp.status}): ${text}`);
    }

    const data = text ? JSON.parse(text) : null;
    const content = data?.choices?.[0]?.message?.content;
    const cleaned = String(content || '').trim();
    return JSON.parse(cleaned);
  }
}

function createRawMessage(to, subject, text, attachmentData, pdfName) {
  const boundary = `smartspend_boundary_${Date.now()}`;
  const sender = process.env.GMAIL_SENDER_ADDRESS || 'yashodhanchinke67@gmail.com';

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
    parts.push(attachmentData.toString('base64'));
    parts.push('');
  }

  parts.push(`--${boundary}--`);

  const raw = parts.join('\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendExistingPdfEmail({ filename, toEmail, subject, text }) {
  if (!hasAuth) {
    throw new Error(
      "Gmail API not configured. Add backend/token.json (recommended) or set GMAIL_REFRESH_TOKEN."
    );
  }
  if (!filename || typeof filename !== 'string') {
    throw new Error("Missing filename.");
  }
  if (!toEmail || typeof toEmail !== 'string') {
    throw new Error("Missing recipient email.");
  }

  const safeName = path.basename(filename);
  if (safeName !== filename) {
    throw new Error("Invalid filename.");
  }

  const pdfPath = path.join(process.cwd(), 'reports', safeName);
  if (!fs.existsSync(pdfPath)) {
    throw new Error("Report file not found on server.");
  }

  const fileData = fs.readFileSync(pdfPath);
  const rawMessage = createRawMessage(
    toEmail,
    subject || "Your SmartSpend Report",
    text || "Attached is your requested report PDF.",
    fileData,
    safeName
  );

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rawMessage }
  });

  return { email_status: 'success' };
}

/**
 * Main export to generate report (email optional)
 */
export async function generateAndSendReport({
  userId,
  userEmail,
  month,
  rangeDays,
  transactionsOverride,
  reportLabelOverride,
  sendEmail = false,
}) {
  try {
    let startDate = null;
    let endDate = null;
    let reportLabel = null;

    if (month) {
      startDate = `${month}-01`;
      const [yearStr, monthStr] = month.split('-');
      const nextMonthDate = new Date(parseInt(yearStr), parseInt(monthStr), 1);
      endDate = nextMonthDate.toISOString().split('T')[0];
      reportLabel = month;
    } else {
      const days = Math.max(1, Math.min(365, Number(rangeDays || 30)));
      const today = new Date();
      const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - days);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
      reportLabel = `last-${days}-days-${startDate}-to-${new Date(end.getTime() - 86400000).toISOString().split('T')[0]}`;
    }

    // If the caller provided transactions (e.g. from ReportsScreen.js), use them directly.
    // This avoids any Supabase reads during report generation.
    let transactions = [];
    if (Array.isArray(transactionsOverride)) {
      transactions = transactionsOverride;
      reportLabel = reportLabelOverride || reportLabel || 'report';
    } else {
      // Mirror the app's transaction fetch pattern (see screens/TransactionsScreen.js):
      // - Fetch transactions with categories + to_account join
      // - Fetch accounts separately and map account_id -> account
      const [{ data: transactionsRaw, error }, { data: accountRows, error: accountError }] = await Promise.all([
        supabase
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
          .order('time', { ascending: false }),
        supabase.from('accounts').select('id,name,type,color,icon').eq('user_id', userId),
      ]);

      if (error) throw error;
      if (accountError) throw accountError;

      const accountMap = Object.fromEntries((accountRows || []).map((account) => [account.id, account]));
      transactions = (Array.isArray(transactionsRaw) ? transactionsRaw : []).map((transaction) => ({
        ...transaction,
        account: accountMap[transaction.account_id] || null,
      }));
    }

    const expenseTransactions = transactions.filter((t) => t.type === 'expense');
    const incomeTransactions = transactions.filter((t) => t.type === 'income');
    const transferTransactions = transactions.filter((t) => t.type === 'transfer');

    let totalSpending = 0;
    let totalIncome = 0;
    const categoryMap = {};

    expenseTransactions.forEach(t => {
      const amt = Number(t.amount || 0);
      totalSpending += amt;
      const catName = t.categories?.name || 'Uncategorized';
      if (!categoryMap[catName]) categoryMap[catName] = 0;
      categoryMap[catName] += amt;
    });

    incomeTransactions.forEach((t) => {
      totalIncome += Number(t.amount || 0);
    });

    const categoryBreakdown = Object.keys(categoryMap).map(k => ({
      name: k,
      total: categoryMap[k]
    })).sort((a, b) => b.total - a.total);

    const highestCategory = categoryBreakdown[0] || { name: 'None', total: 0 };
    
    const topExpenseTransactions = [...expenseTransactions]
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 5)
      .map(t => ({
        amount: t.amount,
        title: t.title || t.categories?.name || 'Expense',
        date: t.date,
        category: t.categories?.name || 'Uncategorized',
        account: t.account?.name || '—'
      }));

    const topIncomeTransactions = [...incomeTransactions]
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 5)
      .map((t) => ({
        amount: t.amount,
        title: t.title || t.categories?.name || 'Income',
        date: t.date,
        category: t.categories?.name || 'Uncategorized',
        account: t.account?.name || '—',
      }));

    const recentTransactions = [...transactions]
      .slice(0, 10)
      .map((t) => ({
        type: t.type,
        amount: t.amount,
        title: t.title || t.categories?.name || 'Transaction',
        date: t.date,
        category: t.categories?.name || (t.type === 'transfer' ? 'Transfer' : 'Uncategorized'),
        account: t.account?.name || '—',
        toAccount: t.to_account?.name || '—',
      }));

    let aiData = null;
    if (transactions.length === 0) {
      aiData = {
        summary: `No expenses were recorded for ${month ? `the month of ${month}` : `the last ${Math.max(1, Math.min(365, Number(rangeDays || 30)))} days`}. Great job keeping spending at zero!`,
        tips: [
          "Keep tracking transactions regularly to maintain visibility.",
          "Set a small savings goal to stay consistent.",
          "Review subscriptions to ensure nothing unexpected appears.",
        ],
      };
    } else {
      const prompt = `
        You are an expert AI financial advisor. Review this user's transactions for ${month ? `the month of ${month}` : `the last ${Math.max(1, Math.min(365, Number(rangeDays || 30)))} days`}.
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
        aiData = await generateInsightsJson({ prompt });
      } catch (e) {
        console.error("AI insights generation error:", e);
        aiData = { summary: "Here is your spending summary.", tips: ["Keep track of your budget!"] };
      }
    }

    const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px; margin: 0 auto; background: #fff; padding: 40px; }
          .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
          h1 { color: #2c1e1a; margin-bottom: 5px; }
          .subtitle { color: #777; font-size: 18px; }
          .summary-card { background: #f9f9f9; padding: 25px; border-radius: 12px; margin-bottom: 30px; border-left: 4px solid #ffcc99; }
          .metrics { display: flex; justify-content: space-between; margin-bottom: 30px; }
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
          ${aiData.tips.map(tip => `<li>${tip}</li>`).join('')}
        </ul>

        <h2>Category Breakdown</h2>
        <table>
          <thead><tr><th>Category</th><th>Amount</th></tr></thead>
          <tbody>
            ${categoryBreakdown.map(c => `<tr><td>${c.name}</td><td>₹${c.total}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Top 5 Expenses</h2>
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Account</th><th>Amount</th></tr></thead>
          <tbody>
            ${topExpenseTransactions.map(t => `<tr><td>${t.date}</td><td>${t.title}</td><td>${t.category}</td><td>${t.account}</td><td>₹${t.amount}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Top 5 Incomes</h2>
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Account</th><th>Amount</th></tr></thead>
          <tbody>
            ${topIncomeTransactions.map(t => `<tr><td>${t.date}</td><td>${t.title}</td><td>${t.category}</td><td>${t.account}</td><td>₹${t.amount}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Recent 10 Transactions</h2>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Category</th><th>Account</th><th>To</th><th>Amount</th></tr></thead>
          <tbody>
            ${recentTransactions.map(t => `<tr><td>${t.date}</td><td>${t.type}</td><td>${t.title}</td><td>${t.category}</td><td>${t.account}</td><td>${t.type === 'transfer' ? t.toAccount : '—'}</td><td>₹${t.amount}</td></tr>`).join('')}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by SmartSpend AI Backend.
        </div>
      </body>
    </html>
    `;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    // Persist reports to disk so they can be retrieved later.
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const safeLabel = String(reportLabel).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `report-${safeUserId}-${safeLabel}.pdf`;
    const pdfPath = path.join(reportsDir, filename);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '16mm', right: '16mm', bottom: '16mm', left: '16mm' },
    });
    await browser.close();

    let emailStatus = 'skipped';
    if (sendEmail && hasAuth && userEmail) {
      const fileData = fs.readFileSync(pdfPath);
      
      const rawMessage = createRawMessage(
        userEmail,
        `Your Expense Report - ${month ? month : `Last ${Math.max(1, Math.min(365, Number(rangeDays || 30)))} days`}`,
        `Hi,\n\nPlease find attached your financial expense report for ${month ? month : `the last ${Math.max(1, Math.min(365, Number(rangeDays || 30)))} days`}.\n\nAI Insights:\n${aiData.summary}\n\nBest,\nSmartSpend AI Module`,
        fileData,
        `Report_${month ? month : `Last_${Math.max(1, Math.min(365, Number(rangeDays || 30)))}_days`}.pdf`
      );

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawMessage }
      });
      emailStatus = 'success';
    }

    return {
      email_status: emailStatus,
      pdf_path: pdfPath,
      filename,
      summary_text: aiData.summary,
      advice_text: aiData.tips.join(' | ')
    };

  } catch (error) {
    console.error("Report generation failed:", error);
    throw error;
  }
}
