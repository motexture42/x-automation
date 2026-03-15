import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const timelineCommand = new Command('timeline')
  .description('Read posts from the timeline')
  .option('-l, --limit <number>', 'Number of posts to extract', '10')
  .option('-t, --type <type>', 'Timeline type: "for-you" or "following"', 'for-you')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const limit = parseInt(options.limit, 10);
    const headless = options.headless !== 'false';
    const isFollowing = options.type === 'following';
    
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

      await page.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded' });

      // Wait for tweets to appear
      try {
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
      } catch (err) {
        // Checking if we are redirected to login
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find tweets on the timeline. UI may have changed.', 2);
      }

      // Select timeline type if specified
      if (isFollowing) {
        try {
          const followingTab = await page.$('a[href="/home"] span:contains("Following")'); // Needs custom XPath or robust selector for real impl
          // Real X implementation has complex tabs. For simplicity, we assume we need to click the 'Following' tab in the top bar.
          const tabs = await page.$$('[role="tablist"] [role="presentation"]');
          if (tabs.length >= 2) {
            await tabs[1].click();
            await new Promise(r => setTimeout(r, 2000)); // Wait for load
          }
        } catch (e) {
          // Ignore if cannot find tabs, might be an issue.
        }
      }

      const extractedPosts: any[] = [];
      const seenIds = new Set<string>();

      // Scrolling loop
      while (extractedPosts.length < limit) {
        const tweetElements = await page.$$('article[data-testid="tweet"]');
        
        for (const el of tweetElements) {
          if (extractedPosts.length >= limit) break;

          try {
            const tweetData = await page.evaluate((article) => {
              // Extract text
              const textElement = article.querySelector('[data-testid="tweetText"]');
              const text = textElement ? (textElement as HTMLElement).innerText : '';
              
              // Extract links (time and user)
              const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
              const statusLink = links.find(l => l.getAttribute('href')?.includes('/status/')) as HTMLAnchorElement | undefined;
              
              const url = statusLink ? `https://twitter.com${statusLink.getAttribute('href')}` : '';
              const idMatch = url.match(/status\/(\d+)/);
              const id = idMatch ? idMatch[1] : '';

              // Extract author info
              const userElement = article.querySelector('[data-testid="User-Name"]');
              const authorText = userElement ? (userElement as HTMLElement).innerText : '';
              const authorLines = authorText.split('\\n');
              const authorName = authorLines[0] || '';
              const authorHandle = authorLines.find(l => l.startsWith('@')) || '';

              // Metrics
              const replyEl = article.querySelector('[data-testid="reply"]');
              const retweetEl = article.querySelector('[data-testid="retweet"]');
              const likeEl = article.querySelector('[data-testid="like"]');
              const viewsEl = article.querySelector('a[href$="/analytics"]');

              return {
                id,
                url,
                text,
                author: {
                  name: authorName,
                  handle: authorHandle
                },
                metrics: {
                  replies: replyEl ? (replyEl as HTMLElement).innerText : '0',
                  retweets: retweetEl ? (retweetEl as HTMLElement).innerText : '0',
                  likes: likeEl ? (likeEl as HTMLElement).innerText : '0',
                  views: viewsEl ? (viewsEl as HTMLElement).innerText : '0',
                }
              };
            }, el);

            if (tweetData.id && !seenIds.has(tweetData.id)) {
              seenIds.add(tweetData.id);
              extractedPosts.push(tweetData);
            }
          } catch (e) {
            // Element might be detached during scrolling, ignore and continue
          }
        }

        if (extractedPosts.length < limit) {
          // Scroll down
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
          await new Promise(r => setTimeout(r, 1500)); // Wait for lazy load
        }
      }

      await browser.close();
      outputJson({ success: true, data: extractedPosts });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while fetching timeline', 3, { detail: error.message });
    }
  });
