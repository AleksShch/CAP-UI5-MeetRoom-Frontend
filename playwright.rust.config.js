const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
module.exports = defineConfig({
  testDir: './test/rust-browser', workers: 1, timeout: 60000, expect: { timeout: 15000 }, reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 }, headless: true,
    launchOptions: fs.existsSync(chrome) ? { executablePath: chrome } : {}, screenshot: 'only-on-failure', trace: 'off'
  },
  webServer: {
    command: 'node scripts/start.js', url: 'http://127.0.0.1:4175/health', reuseExistingServer: false, timeout: 30000,
    env: { PORT: '4175', BACKEND_URL: process.env.RUST_BACKEND_URL || 'http://127.0.0.1:4005' }
  }
});
