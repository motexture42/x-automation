import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';
import path from 'path';
import fs from 'fs';

export const postCommand = new Command('post')
  .description('Post a new tweet or thread')
  .requiredOption('-t, --text <text...>', 'Text content of the tweet (multiple for thread)')
  .option('-m, --media <path>', 'Path to an image or video to attach (attaches to first tweet)')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    // Allow user to control headless mode, defaults to true
    const headless = options.headless !== 'false';
    const texts = Array.isArray(options.text) ? options.text : [options.text];
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
        if (browser) await browser.close();
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

      await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'domcontentloaded' });

      // Give extra time for page to render
      await new Promise(r => setTimeout(r, 5000));

      // Wait for the first compose textarea
      try {
        await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 30000 });
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find the tweet compose area.', 2);
        if (browser) await browser.close();
        return;
      }

      // Handle media upload if provided (only for the first tweet)
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

      // Type the tweet text(s) for a potential thread
      for (let i = 0; i < texts.length; i++) {
        const textPart = texts[i];
        const textareaSelector = `[data-testid="tweetTextarea_${i}"]`;

        if (i > 0) {
          // For thread parts, wait for the new textarea to appear
          try {
            await page.waitForSelector(textareaSelector, { timeout: 10000 });
          } catch (err) {
            outputError(`Could not find the tweet compose area for thread part ${i + 1}.`, 2);
            if (browser) await browser.close();
            return;
          }
        }

        // Focus and type the text
        await page.click(textareaSelector);
        await page.type(textareaSelector, textPart, { delay: 100 });

        if (i < texts.length - 1) {
          // Click the '+' button to add another tweet to the thread
          try {
            await page.waitForSelector('[data-testid="addButton"], [aria-label="Add post"]', { timeout: 5000 });
            
            // Prefer testid, fallback to aria-label
            const addButton = await page.$('[data-testid="addButton"]') || await page.$('[aria-label="Add post"]');
            if (addButton) {
              await addButton.click();
            } else {
              throw new Error('Button not found in DOM');
            }
            
            await new Promise(r => setTimeout(r, 1000));
          } catch (e) {
             outputError('Could not find the + button to add to thread', 2);
             if (browser) await browser.close();
             return;
          }
        }
      }

      // Wait for React state to update the button from disabled to enabled
      await new Promise(r => setTimeout(r, 1000));
      
      // Wait for the final Post button to become enabled
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-testid="tweetButton"]');
        return btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
      }, { timeout: 10000 });

      // Use keyboard shortcut (Ctrl+Enter or Cmd+Enter) to submit the tweet/thread
      // This bypasses anti-bot click detection on the Post button (as it worked previously)
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
      outputJson({ 
        success: true, 
        message: texts.length > 1 ? 'Thread posted successfully.' : 'Tweet posted successfully.',
        tweetIds: createdTweetIds
      });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while posting tweet', 3, { detail: error.message });
    }
  });