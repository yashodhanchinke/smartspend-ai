import './config.js';
import { supabase } from './supabase.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import puppeteer from 'puppeteer';
import { google } from 'googleapis';
import fs from 'fs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
);

let hasAuth = false;
try {
  const tokenContent = fs.readFileSync('token.json');
  oauth2Client.setCredentials(JSON.parse(tokenContent));
  hasAuth = true;
} catch (err) {
  if (process.env.GMAIL_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    hasAuth = true;
  }
}

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

function createRawMessage(to, subject, text, attachmentData, pdfName) {
  const boundary = `smartspend_boundary_${Date.now()}`;
  const sender = process.env.GMAIL_SENDER_ADDRESS || 'me';

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

/**
 * Main export to generate and email report
 */
export async function generateAndSendReport({ userId, userEmail, month }) {
  try {
    const startDate = `${month}-01`;
    const [yearStr, monthStr] = month.split('-');
    const nextMonthDate = new Date(parseInt(yearStr), parseInt(monthStr), 1);
    const endDate = nextMonthDate.toISOString().split('T')[0];

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('amount, type, date, title, categories(name, icon)')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('date', startDate)
      .lt('date', endDate);

    if (error) throw error;

    if (!transactions || transactions.length === 0) {
      if (hasAuth && userEmail) {
        const rawMessage = createRawMessage(
          userEmail,
          `Your Monthly Expense Report - ${month}`,
          `No expenses were recorded for the month of ${month}. Keep up the good work saving!`,
          null,
          null
        );
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: rawMessage }
        });
      }
      return { email_status: 'success', summary_text: 'No expenses', advice_text: 'N/A' };
    }

    let totalSpending = 0;
    const categoryMap = {};

    transactions.forEach(t => {
      const amt = Number(t.amount || 0);
      totalSpending += amt;
      const catName = t.categories?.name || 'Uncategorized';
      if (!categoryMap[catName]) categoryMap[catName] = 0;
      categoryMap[catName] += amt;
    });

    const categoryBreakdown = Object.keys(categoryMap).map(k => ({
      name: k,
      total: categoryMap[k]
    })).sort((a, b) => b.total - a.total);

    const highestCategory = categoryBreakdown[0] || { name: 'None', total: 0 };
    
    const topTransactions = [...transactions]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map(t => ({
        amount: t.amount,
        title: t.title || t.categories?.name || 'Expense',
        date: t.date,
        category: t.categories?.name || 'Uncategorized'
      }));

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `
      You are an expert AI financial advisor. Review this user's monthly expense data for ${month}.
      Total Spending: ₹${totalSpending}
      Categories: ${JSON.stringify(categoryBreakdown)}
      Top Transactions: ${JSON.stringify(topTransactions)}

      Provide the response in raw JSON format without markdown wrapping, with exactly these two keys:
      {
        "summary": "A friendly 2-3 sentence summary of their spending habits.",
        "tips": ["Tip 1", "Tip 2", "Tip 3"]
      }
      Focus on actionable advice (e.g., reducing overspending, saving tips). Use ₹ for currency.
    `;

    const chatResult = await model.generateContent(prompt);
    const responseText = chatResult.response.text();
    
    let aiData;
    try {
      const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      aiData = JSON.parse(cleaned);
    } catch(e) {
      console.error("AI JSON parse error:", e);
      aiData = { summary: "Here is your monthly spending summary.", tips: ["Keep track of your budget!"] };
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
          <h1>SmartSpend Monthly Report</h1>
          <div class="subtitle">${month}</div>
        </div>

        <div class="metrics">
          <div class="metric-box">
            <div>Total Spending</div>
            <div class="metric-val">₹${totalSpending}</div>
          </div>
          <div class="metric-box">
            <div>Highest Spending Category</div>
            <div class="metric-val">${highestCategory.name}</div>
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

        <h2>Top 5 Transactions</h2>
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Amount</th></tr></thead>
          <tbody>
            ${topTransactions.map(t => `<tr><td>${t.date}</td><td>${t.title}</td><td>${t.category}</td><td>₹${t.amount}</td></tr>`).join('')}
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
    const pdfPath = `/tmp/report-${userId}-${month}.pdf`;
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();

    let emailStatus = 'failed';
    if (hasAuth && userEmail) {
      const fileData = fs.readFileSync(pdfPath);
      
      const rawMessage = createRawMessage(
        userEmail,
        `Your Monthly Expense Report - ${month}`,
        `Hi,\n\nPlease find attached your monthly financial expense report for ${month}.\n\nAI Insights:\n${aiData.summary}\n\nBest,\nSmartSpend AI Module`,
        fileData,
        `Monthly_Report_${month}.pdf`
      );

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawMessage }
      });
      emailStatus = 'success';
    } else {
      console.warn("Gmail API not configured or no user email provided. Skipping email send.");
    }

    return {
      email_status: emailStatus,
      pdf_path: pdfPath,
      summary_text: aiData.summary,
      advice_text: aiData.tips.join(' | ')
    };

  } catch (error) {
    console.error("Report generation failed:", error);
    throw error;
  }
}
