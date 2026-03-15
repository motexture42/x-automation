import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { saveSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const authCommand = new Command('auth')
  .description('Launch an interactive browser to log in to X')
  .action(async () => {
    try {
      // Launch non-headless browser for interactive login
      const { browser, page } = await launchBrowser(false);
      
      console.log('Browser launched. Please log in to X.');
      console.log('Once logged in, the session will be saved automatically when you are on the home timeline.');
      console.log('Waiting for successful login...');
      
      await page.goto('https://twitter.com/i/flow/login');
      
      // Wait for the home timeline or account page which indicates successful login
      await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 300000 }); // 5 minutes max
      
      const cookies = await page.cookies();
      saveSession(cookies);
      
      await browser.close();
      
      outputJson({ success: true, message: 'Authentication successful, session saved.' });
    } catch (error: any) {
      outputError('Authentication failed or timed out.', 3, { detail: error.message });
    }
  });
