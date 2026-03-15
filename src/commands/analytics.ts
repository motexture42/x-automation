import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const analyticsCommand = new Command('analytics')
  .description('Fetch analytics/metrics for a specific tweet')
  .requiredOption('-i, --id <id>', 'ID of the tweet to fetch analytics for')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const headless = options.headless !== 'false';
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
        // Give it a brief moment to render metrics
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find the tweet. It might be deleted or UI changed.', 2);
        if (browser) await browser.close();
        return;
      }

      const tweetData = await page.evaluate((id) => {
        // In detail view, the main tweet is usually the first article or the one with the matching status URL
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        
        // Find the specific tweet by ID or fallback to the first one
        let targetArticle = articles.find(a => {
            const links = Array.from(a.querySelectorAll('a[href*="/status/"]'));
            return links.some(l => l.getAttribute('href')?.includes(`/status/${id}`));
        });

        if (!targetArticle && articles.length > 0) {
            targetArticle = articles[0]; // fallback
        }

        if (!targetArticle) return null;

        const textElement = targetArticle.querySelector('[data-testid="tweetText"]');
        const text = textElement ? (textElement as HTMLElement).innerText : '';

        const replyEl = targetArticle.querySelector('[data-testid="reply"]');
        const retweetEl = targetArticle.querySelector('[data-testid="retweet"]');
        const likeEl = targetArticle.querySelector('[data-testid="like"]');
        const bookmarkEl = targetArticle.querySelector('[data-testid="bookmark"]');
        
        // Views can be tricky, sometimes under an analytics link, sometimes just another text node
        // In the detail view, Twitter often uses "View post engagements"
        let viewsStr = '0';
        const viewsLink = targetArticle.querySelector('a[href$="/analytics"]');
        if (viewsLink) {
           const span = viewsLink.querySelector('span');
           viewsStr = span ? span.innerText : (viewsLink as HTMLElement).innerText;
        } else {
           // Fallback for detail view views formatting
           const spans = Array.from(targetArticle.querySelectorAll('span'));
           const viewsSpan = spans.find(s => s.innerText.toLowerCase().includes('views') && s.innerText.match(/\\d/));
           if (viewsSpan) {
               viewsStr = viewsSpan.innerText.replace(/[^\\d.,KMBkm]/g, '').trim();
           }
        }

        return {
          id,
          text,
          metrics: {
            replies: replyEl ? (replyEl as HTMLElement).innerText || '0' : '0',
            retweets: retweetEl ? (retweetEl as HTMLElement).innerText || '0' : '0',
            likes: likeEl ? (likeEl as HTMLElement).innerText || '0' : '0',
            bookmarks: bookmarkEl ? (bookmarkEl as HTMLElement).innerText || '0' : '0',
            views: viewsStr || '0'
          }
        };
      }, tweetId);

      await browser.close();

      if (tweetData) {
        outputJson({ success: true, data: tweetData });
      } else {
        outputError('Failed to extract metrics from the tweet.', 2);
      }

    } catch (error: any) {
      if (browser) await browser.close();
      outputError(`General error while fetching analytics for tweet ${options.id}`, 3, { detail: error.message });
    }
  });
