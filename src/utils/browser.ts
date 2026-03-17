import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

function getChromeExecutablePath() {
  const paths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Windows
    '/usr/bin/google-chrome', // Linux
    '/usr/bin/google-chrome-stable' // Linux
  ];
  return paths.find(p => fs.existsSync(p));
}

export async function launchBrowser(headless: boolean = true): Promise<{ browser: Browser; page: Page }> {
  const executablePath = getChromeExecutablePath();
  
  // Define a persistent directory for the browser profile to enable caching
  // This drastically improves load times on heavy SPAs like X.
  const userDataDir = path.join(process.cwd(), '.browser_data');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  
  const browser = await puppeteer.launch({
    headless: headless,
    executablePath: executablePath || undefined,
    defaultViewport: null, // Let viewport adjust naturally
    userDataDir: userDataDir, // Use persistent cache
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-notifications',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  // Stealth plugin handles User-Agent automatically when combined with a real Chrome binary.
  // We also inject a script to remove the webdriver flag just in case.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });
  
  return { browser, page };
}
