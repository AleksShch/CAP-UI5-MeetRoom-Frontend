const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
module.exports = defineConfig({
  testDir:'./test/browser',workers:1,timeout:45000,expect:{timeout:15000},reporter:'list',
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:1000},headless:true,launchOptions:fs.existsSync(chrome)?{executablePath:chrome}:{},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node test/fixtures/browser-server.cjs',url:'http://127.0.0.1:4173/health',reuseExistingServer:false,timeout:30000,env:{NODE_ENV:'test',CDS_ENV:'test',CDS_REQUIRES_DB_CREDENTIALS_URL:':memory:'}}
});
