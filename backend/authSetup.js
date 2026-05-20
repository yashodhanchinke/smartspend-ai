import './config.js';
import { google } from 'googleapis';
import readline from 'readline';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

function resolveTokenPath() {
  if (process.env.GMAIL_TOKEN_PATH) return process.env.GMAIL_TOKEN_PATH;

  const candidates = [
    path.join(os.homedir(), '.config', 'smartspend-ai', 'gmail_token.json'),
    path.join('/tmp', 'smartspend-ai', 'gmail_token.json'),
  ];

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      return candidate;
    } catch {
      // try next
    }
  }

  // Final fallback: current working directory (avoid, but don't block setup)
  return path.join(process.cwd(), 'token.json');
}

function ensureTokenDir(tokenPath) {
  const dir = path.dirname(tokenPath);
  fs.mkdirSync(dir, { recursive: true });
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
);

function getNewToken(oAuth2Client) {
  const TOKEN_PATH = resolveTokenPath();
  ensureTokenDir(TOKEN_PATH);
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      
      // Save the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
        console.log('You can now run your server and send emails automatically!');
      });
    });
  });
}

const TOKEN_PATH = resolveTokenPath();
if (!fs.existsSync(TOKEN_PATH)) {
  console.log('No existing token found at', TOKEN_PATH);
  console.log('Starting Gmail OAuth setup...');
  getNewToken(oauth2Client);
} else {
  console.log('Token already exists at', TOKEN_PATH);
  console.log('If you need to re-authenticate, delete that file and run this again.');
}
