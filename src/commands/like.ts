import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const likeCommand = new Command('like')
  .description('Like a specific tweet')
  .requiredOption('-i, --id <id>', 'ID of the tweet to like')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    // Like action is a write action, might need headful or headless=false, let's try keeping it configurable but default to headless true since it's a simple click, but to be safe against bot detection, we might force headless=false. We'll stick to configurable with default true for now, but if it fails we can recommend false. Actually, let's follow post/reply and force headless=false for Write operations to be safe from canvas fingerprinting bans.
    const headless = false; 
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
        // Also wait for the like or unlike button to appear so we know it's fully loaded
        await page.waitForSelector('[data-testid="like"], [data-testid="unlike"]', { timeout: 15000 });
        // Give it a brief moment
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find the tweet. It might be deleted or UI changed.', 2);
        if (browser) await browser.close();
        return;
      }

      // Check if already liked or click like
      const result = await page.evaluate(async (id) => {
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        
        // Find the specific tweet by ID or fallback to the first one
        let targetArticle = articles.find(a => {
            const links = Array.from(a.querySelectorAll('a[href*="/status/"]'));
            return links.some(l => l.getAttribute('href')?.includes(`/status/${id}`));
        });

        if (!targetArticle && articles.length > 0) {
            targetArticle = articles[0]; // fallback
        }

        if (!targetArticle) return { success: false, reason: 'Tweet not found in DOM' };

        const unlikeBtn = targetArticle.querySelector('[data-testid="unlike"]') as HTMLElement;
        if (unlikeBtn) {
            return { success: true, alreadyLiked: true };
        }

        const likeBtn = targetArticle.querySelector('[data-testid="like"]') as HTMLElement;
        if (likeBtn) {
            likeBtn.click();
            return { success: true, alreadyLiked: false };
        }

        return { success: false, reason: 'Like button not found' };
      }, tweetId);

      if (!result.success) {
         outputError(`Failed to like tweet: ${result.reason}`, 2);
         if (browser) await browser.close();
         return;
      }

      if (!result.alreadyLiked) {
         // Wait a moment for the request to go through
         await new Promise(r => setTimeout(r, 2000));
      }

      await browser.close();
      outputJson({ 
        success: true, 
        message: result.alreadyLiked ? `Tweet ${tweetId} was already liked.` : `Successfully liked tweet ${tweetId}.`,
        alreadyLiked: result.alreadyLiked
      });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError(`General error while liking tweet ${options.id}`, 3, { detail: error.message });
    }
  });
