import './config.js';
import { generateAndSendReport } from './generateMonthlyReport.js';

async function run() {
  const userId = process.argv[2];
  const userEmail = process.argv[3];
  const month = process.argv[4] || '2026-03';

  if (!userId || !userEmail) {
    console.log("Usage: node testRun.js <user_id> <user_email> [month_YYYY-MM]");
    process.exit(1);
  }

  console.log(`Generating report for ${userEmail} (Month: ${month})...`);
  try {
    const result = await generateAndSendReport({ userId, userEmail, month });
    console.log("Success:", result);
  } catch (e) {
    console.error("Failed:", e);
  }
}

run();
