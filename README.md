# Ogoo Health – React Native & Expo Mobile Application 📱

Ogoo Health is a highly polished, fully functional mobile medical assistant and companion app. It is structured as an industry-standard **React Native & Expo** project so that you can open and run it directly in **VS Code** on your computer, while maintaining a fully integrated Express & Vite web server for live previewing in AI Studio.

---

## 🚀 How to Run the Mobile App in VS Code

To build and run Ogoo Health as a mobile app on your iPhone, Android device, or local emulator, follow these quick steps:

### 1. Prerequisites
Make sure you have Node.js installed on your computer.

### 2. Open the Folder in VS Code
Open this folder in VS Code.

### 3. Install Mobile Dependencies
Run the following command in your VS Code terminal to install all mobile dependencies:
```bash
npm install
```

### 4. Start the Expo Mobile Server
Start the local Expo development environment by running:
```bash
npm run mobile
```
This boots up the Metro Bundler and displays an interactive QR code directly in your terminal.

### 5. Open on Your Device
* **iOS (iPhone/iPad):** Install the **Expo Go** app from the Apple App Store. Open your phone camera, scan the QR code, and it will load Ogoo Health instantly on your physical device.
* **Android:** Install the **Expo Go** app from the Google Play Store. Open Expo Go, scan the QR code, and start playing!
* **Simulator / Emulator:** Press `i` to launch in the iOS Simulator or `a` to launch in the Android Emulator.

---

## 🛠️ Hybrid Project Structure Explained

To ensure full compatibility with both local VS Code mobile development and live web previews in AI Studio, this project uses a custom dual-architecture structure:

1. **`App.tsx` (Project Root):** The primary **React Native / Expo** mobile entry point. This contains the high-fidelity native application with mobile biometrics, hydration tracking, fall sensors, schedule care items, and voice responses.
2. **`app.json` (Project Root):** The standard Expo configuration for app bundles, launcher icons, splash screen backdrops, and device orientations.
3. **`src/App.tsx` & `src/main.tsx`:** The companion web version.
4. **`package.json` Scripts:**
   * `npm run mobile` — Launches the **React Native Metro Bundler** via Expo (ideal for VS Code).
   * `npm run dev` — Boots the **Express & Vite companion server** to serve the web version in AI Studio's preview window.
