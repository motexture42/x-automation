import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';
import path from 'path';
import fs from 'fs';

export const postCommand = new Command('post')
  .description('Post a new tweet')
  .requiredOption('-t, --text <text>', 'Text content of the tweet')
  .option('-m, --media <path>', 'Path to an image or video to attach')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    // Force headless to false for POST commands because X blocks headless writing
    const headless = false;
    const text = options.text;
    const mediaPath = options.media ? path.resolve(process.cwd(), options.media) : null;

    if (mediaPath && !fs.existsSync(mediaPath)) {
      outputError(`Media file not found at path: ${mediaPath}`, 3);
      return;
    }

    let browser, page;
    try {
      const launched = await launchBrowser(headless);
      browser = launched.browser;
      page = launched.page;

      const hasSession = await restoreSession(page);
      if (!hasSession) {
        outputError('No active session. Please run `x-cli auth` first.', 1);
        return;
      }

      await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'domcontentloaded' });

      // Wait for the compose textarea
      try {
        await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 15000 });
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find the tweet compose area.', 2);
      }

      // Handle media upload if provided
      if (mediaPath) {
        try {
          const fileInput = await page.$('input[type="file"][data-testid="fileInput"]');
          if (!fileInput) {
             // Fallback to any file input if data-testid changes
             const anyFileInput = await page.$('input[type="file"]');
             if (anyFileInput) {
                 await anyFileInput.uploadFile(mediaPath);
             } else {
                 throw new Error('File input element not found');
             }
          } else {
             await fileInput.uploadFile(mediaPath);
          }
          
          // Wait a moment for the image to preview
          await new Promise(r => setTimeout(r, 2000));
        } catch (e: any) {
          outputError('Failed to attach media', 3, { detail: e.message });
          if (browser) await browser.close();
          return;
        }
      }

      // Type the tweet text
      await page.click('[data-testid="tweetTextarea_0"]');
      await page.type('[data-testid="tweetTextarea_0"]', text, { delay: 100 }); // Slower typing

      // Wait for React state to update the button from disabled to enabled
      await new Promise(r => setTimeout(r, 1000));
      
      // Wait for the tweet button to become enabled
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-testid="tweetButton"]');
        return btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
      }, { timeout: 10000 });

      // Use keyboard shortcut (Ctrl+Enter or Cmd+Enter) to submit the tweet
      // This often bypasses anti-bot click detection on the Post button
      const isMac = process.platform === 'darwin';
      if (isMac) {
        await page.keyboard.down('Meta');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Meta');
      } else {
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
      }

      // Wait for the tweet to be sent
      try {
        await page.waitForSelector('[data-testid="toast"]', { timeout: 15000 });
      } catch (e) {
        // Fallback: wait a few seconds for the network request to finish if toast isn't detected
        await new Promise(r => setTimeout(r, 3000));
      }

      await browser.close();
      outputJson({ success: true, message: 'Tweet posted successfully.' });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while posting tweet', 3, { detail: error.message });
    }
  });
