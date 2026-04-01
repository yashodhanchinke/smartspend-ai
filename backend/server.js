import './config.js';
import express from 'express';
import cors from 'cors';
import { supabase } from './supabase.js';
import { generateAndSendReport } from './generateMonthlyReport.js';

const app = express();
app.use(cors());
app.use(express.json());

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

    const { month } = req.body;
    if (!month) {
      return res.status(400).json({ error: 'Missing month param (format YYYY-MM)' });
    }

    // Process the report async
    const result = await generateAndSendReport({
      userId: user.id,
      userEmail: user.email,
      month
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Backend running on port ${PORT}`);
});
