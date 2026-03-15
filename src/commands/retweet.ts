import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const retweetCommand = new Command('retweet')
  .description('Retweet (Repost) a specific tweet')
  .requiredOption('-i, --id <id>', 'ID of the tweet to retweet')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const headless = false; // Write operation, force visible
    const tweetId = options.id;

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

      await page.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'domcontentloaded' });

      try {
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
        await page.waitForSelector('[data-testid="retweet"], [data-testid="unretweet"]', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find the tweet. It might be deleted or UI changed.', 2);
        if (browser) await browser.close();
        return;
      }

      // Check if already retweeted or click retweet
      const result = await page.evaluate(async (id) => {
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        
        let targetArticle = articles.find(a => {
            const links = Array.from(a.querySelectorAll('a[href*="/status/"]'));
            return links.some(l => l.getAttribute('href')?.includes(`/status/${id}`));
        });

        if (!targetArticle && articles.length > 0) {
            targetArticle = articles[0]; // fallback
        }

        if (!targetArticle) return { success: false, reason: 'Tweet not found in DOM' };

        const unretweetBtn = targetArticle.querySelector('[data-testid="unretweet"]') as HTMLElement;
        if (unretweetBtn) {
            return { success: true, alreadyRetweeted: true };
        }

        const retweetBtn = targetArticle.querySelector('[data-testid="retweet"]') as HTMLElement;
        if (retweetBtn) {
            retweetBtn.click();
            return { success: true, alreadyRetweeted: false, clicked: true };
        }

        return { success: false, reason: 'Retweet button not found' };
      }, tweetId);

      if (!result.success) {
         outputError(`Failed to retweet: ${result.reason}`, 2);
         if (browser) await browser.close();
         return;
      }

      if (!result.alreadyRetweeted && result.clicked) {
         // After clicking the retweet button, a dropdown menu appears.
         // We need to click the "Repost" option from that menu.
         try {
            await page.waitForSelector('[data-testid="retweetConfirm"]', { timeout: 5000 });
            await page.evaluate(() => {
                const confirmBtn = document.querySelector('[data-testid="retweetConfirm"]') as HTMLElement;
                if (confirmBtn) confirmBtn.click();
            });
            await new Promise(r => setTimeout(r, 2000)); // wait for network
         } catch (e) {
            outputError('Failed to click confirm repost button.', 2);
            if (browser) await browser.close();
            return;
         }
      }

      await browser.close();
      outputJson({ 
        success: true, 
        message: result.alreadyRetweeted ? `Tweet ${tweetId} was already retweeted.` : `Successfully retweeted tweet ${tweetId}.`,
        alreadyRetweeted: result.alreadyRetweeted
      });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError(`General error while retweeting tweet ${options.id}`, 3, { detail: error.message });
    }
  });
