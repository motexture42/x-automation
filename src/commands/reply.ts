import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';
import path from 'path';
import fs from 'fs';

export const replyCommand = new Command('reply')
  .description('Reply to a specific tweet')
  .requiredOption('-i, --id <id>', 'ID of the tweet to reply to')
  .requiredOption('-t, --text <text>', 'Text content of the reply')
  .option('-m, --media <path>', 'Path to an image or video to attach')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    // Allow user to control headless mode, defaults to true but can be risky for write actions
    const headless = options.headless !== 'false';
    const tweetId = options.id;
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

      const createdTweetIds: string[] = [];
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('CreateTweet') && response.status() === 200) {
          try {
            const json = await response.json();
            const tweetResult = json?.data?.create_tweet?.tweet_results?.result;
            if (tweetResult && tweetResult.rest_id) {
              createdTweetIds.push(tweetResult.rest_id);
            }
          } catch (e) {
            // ignore
          }
        }
      });

      await page.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'domcontentloaded' });

      // Wait for the reply textarea
      try {
        await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 15000 });
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find the reply area. Tweet might be deleted or UI changed.', 2);
      }

      // Handle media upload if provided
      if (mediaPath) {
        try {
          const fileInput = await page.$('input[type="file"][data-testid="fileInput"]');
          if (!fileInput) {
             const anyFileInput = await page.$('input[type="file"]');
             if (anyFileInput) {
                 await anyFileInput.uploadFile(mediaPath);
             } else {
                 throw new Error('File input element not found');
             }
          } else {
             await fileInput.uploadFile(mediaPath);
          }
          
          await new Promise(r => setTimeout(r, 2000));
        } catch (e: any) {
          outputError('Failed to attach media', 3, { detail: e.message });
          if (browser) await browser.close();
          return;
        }
      }

      // Type the reply text
      await page.click('[data-testid="tweetTextarea_0"]');
      await page.type('[data-testid="tweetTextarea_0"]', text, { delay: 100 });

      // Wait for React state to update the button from disabled to enabled
      await new Promise(r => setTimeout(r, 1000));
      
      // Wait for the reply button to become enabled
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-testid="tweetButtonInline"]');
        return btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
      }, { timeout: 10000 });

      // Use keyboard shortcut (Ctrl+Enter or Cmd+Enter) to submit the reply
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

      // Wait for the reply to be sent
      try {
        await page.waitForSelector('[data-testid="toast"]', { timeout: 15000 });
      } catch (e) {
        // Fallback: wait a few seconds for the network request to finish if toast isn't detected
        await new Promise(r => setTimeout(r, 3000));
      }

      await browser.close();
      outputJson({ 
        success: true, 
        message: `Successfully replied to tweet ${tweetId}.`,
        tweetIds: createdTweetIds
      });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError(`General error while replying to tweet ${options.id}`, 3, { detail: error.message });
    }
  });
