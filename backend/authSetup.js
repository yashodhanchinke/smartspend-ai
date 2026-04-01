import './config.js';
import { google } from 'googleapis';
import readline from 'readline';
import fs from 'fs';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
const TOKEN_PATH = 'token.json';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
);

function getNewToken(oAuth2Client) {
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

fs.readFile(TOKEN_PATH, (err, content) => {
  if (err) {
    console.log("No existing token found. Starting setup...");
    getNewToken(oauth2Client);
  } else {
    console.log("Token already exists at", TOKEN_PATH);
    console.log("If you need to re-authenticate, delete token.json and run this again.");
  }
});
