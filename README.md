# SmartSpend AI

Welcome to **SmartSpend AI**! This is a React Native Expo application designed to help you manage your finances intelligently.

This guide is written specifically for beginners. Even if you have a brand-new operating system with no prior programming tools or libraries installed, these step-by-step instructions will help you get the app running on your machine.

---

## 🛠️ Phase 1: Install Required Software (Prerequisites)

Before running the project, your computer needs a few basic tools: **Git** (to download the code) and **Node.js** (to run the app and install its packages).

Choose your Operating System below and follow the instructions:

### 🪟 Windows
1. **Install Git**: Download and install from [git-scm.com/download/win](https://git-scm.com/download/win). Keep all default settings during installation.
2. **Install Node.js**: Download the "LTS" (Long Term Support) version from [nodejs.org](https://nodejs.org/). Run the installer and keep the default settings.

### 🍎 macOS
1. **Install Homebrew** (A package manager that makes installing things easy): Open the "Terminal" app and paste this command, then press Entry:
   `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
2. **Install Git and Node.js**: In the Terminal, run:
   `brew install git node`

### 🐧 Linux (Ubuntu/Debian)
Open your Terminal and run these commands one by one:
1. Update your package manager: `sudo apt update`
2. Install Git: `sudo apt install git`
3. Install Node.js & npm: `sudo apt install nodejs npm`

---

## 🚀 Phase 2: Download and Setup the Project

Once Git and Node.js are installed, you need to download the project and install its specific dependencies.

1. **Open your Terminal or Command Prompt**
2. **Download the project** (Skip this step if you already have the project files on your computer):
   ```bash
   git clone <YOUR_REPOSITORY_URL_HERE>
   ```
3. **Navigate into the project folder**:
   ```bash
   cd smartspend-ai
   ```
4. **Install all project libraries**:
   Run the following command. This will look at `package.json` and install everything the app needs to function. (This might take a minute or two).
   ```bash
   npm install
   ```
5. **Install Expo CLI globally** (Optional but recommended for React Native projects):
   ```bash
   npm install -g expo-cli
   ```

---

## 📱 Phase 3: Run the Application

Now that everything is installed, you are ready to start the app!

1. In your Terminal, make sure you are still inside the `smartspend-ai` folder.
2. Run the start command:
   ```bash
   npm start
   ```
   *or you can use:*
   ```bash
   npx expo start
   ```

3. **What happens next?**
   A QR code will appear in your terminal or in a browser window that automatically opens.

### How to view the app:
- **On your physical phone**: 
  1. Download the **Expo Go** app from the Apple App Store (iOS) or Google Play Store (Android).
  2. Open the Expo Go app.
  3. Scan the QR code from your terminal/browser (Use your phone's Camera app for iPhone, or the "Scan QR" button inside Expo Go for Android).
  4. The app will build and open on your phone!
  
- **On a computer emulator**:
  If you have Android Studio or Xcode installed, you can press `a` for Android or `i` for iOS in the terminal to launch a virtual phone on your screen.

---

## ❓ Troubleshooting Common Errors

- **"Command not found: npm" or "Command not found: node"**: Your terminal doesn't recognize Node.js. Try closing the terminal and opening a new one. If it still doesn't work, reinstall Node.js and ensure you check the box that says "Add to PATH" during installation.
- **Dependency or Cache Errors**: If the app fails to start or crashes immediately, try clearing the cache by running:
  ```bash
  npm start -- -c
  ```
- **"Ports are already in use"**: If Expo complains about port 8081 being used, you can try starting it on a different port:
  ```bash
  npx expo start --port 19000
  ```

---
Happy Coding! 🎉

npx expo start --dev-client.

---

## Reliable Report API Over Mobile Data (Cloudflared / Ngrok)

If your phone is on mobile data (not same Wi-Fi as laptop), local backend URL like `http://192.168.x.x:3000` will fail.
Use a public tunnel and set `EXPO_PUBLIC_API_URL` to that tunnel URL.

### 1) Start backend

```bash
npm run backend:start
```

### 2) Start one tunnel (new terminal)

Cloudflared:

```bash
npm run tunnel:cloudflared
```

Ngrok:

```bash
npm run tunnel:ngrok
```

Copy the `https://...` URL shown by tunnel output.

### 3) Set Expo API URL

```bash
bash scripts/set-expo-api-url.sh https://YOUR_TUNNEL_URL
```

### 4) Restart app bundler

```bash
npm run start:devclient
```

### Recommended 3-terminal run flow

Terminal 1 (backend):

```bash
cd ~/smartspend-ai/backend
npm start
```

Terminal 2 (tunnel):

```bash
cd ~/smartspend-ai
ngrok http 3000
```

Copy the `https://...ngrok...` forwarding URL.

Terminal 3 (app):

```bash
cd ~/smartspend-ai
bash scripts/set-expo-api-url.sh https://YOUR_NGROK_URL
npm run start:devclient
```

Notes:
- Keep backend + tunnel terminals open.
- If ngrok URL changes, run `set-expo-api-url.sh` again and restart Expo.
- Health check:
  - local: `http://localhost:3000/api/health`
  - tunnel: `https://YOUR_NGROK_URL/api/health`

### API key guidance (Gemini + Groq)

- Keep `GEMINI_API_KEY` and `GROQ_API_KEY` only in backend/root `.env` (server side).
- Do not expose them as `EXPO_PUBLIC_*`.
- If report generation feels slow, backend automatically falls back from Gemini to Groq when needed.
- Network errors for report/email are usually backend URL reachability issues, not Gemini/Groq key issues.

---

## Automatic Month-End Report Email

Automatic monthly report email is enabled in backend scheduler.

Behavior:
- On the last calendar day of month (Asia/Kolkata), backend generates that month report and emails user.
- Example: March report is generated/sent on March 31.
- Safety catch-up: if backend was down on month-end, it retries previous month on day 1.
- Duplicate prevention is enabled (`is_automatic + generated_for_month` uniqueness), so it won’t send the same month twice.

Important:
- Backend must be running continuously for scheduler to execute automatically.
