import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const debugCommand = new Command('debug')
  .description('Spawns a manual headful Chrome session for debugging or warming up cache')
  .action(async () => {
    let browser: any;
    try {
      console.log('Launching debug browser session. Close the browser window to exit...');
      
      // Force headless=false so the user can interact
      const launched = await launchBrowser(false);
      browser = launched.browser;
      const page = launched.page;

      const hasSession = await restoreSession(page);
      if (hasSession) {
         console.log('Session restored successfully. Navigating to home...');
         await page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded' });
      } else {
         console.log('No active session found. Navigating to login...');
         await page.goto('https://twitter.com/login', { waitUntil: 'domcontentloaded' });
      }

      // Keep the process alive until the browser window is manually closed
      await new Promise<void>((resolve) => {
        browser.on('disconnected', () => {
          console.log('Browser disconnected. Exiting debug session.');
          resolve();
        });
      });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while launching debug session', 3, { detail: error.message });
    }
  });