import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const commentsCommand = new Command('comments')
  .description('Scrape comments (replies) from a specific tweet')
  .requiredOption('-i, --id <id>', 'ID of the tweet to scrape comments from')
  .option('-l, --limit <number>', 'Number of comments to extract', '10')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    const limit = parseInt(options.limit, 10);
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
        return;
      }

      await page.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'domcontentloaded' });

      // Wait for tweets to appear
      try {
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find tweets. UI may have changed or tweet deleted.', 2);
      }

      const extractedComments: any[] = [];
      const seenIds = new Set<string>();

      // The main tweet will also be matched, so we should skip it.
      seenIds.add(tweetId); 

      // Scroll down a bit initially to load comments
      await page.evaluate(() => window.scrollBy(0, 300));
      await new Promise(r => setTimeout(r, 1000));

      // Scrolling loop
      let previousHeight = 0;
      let noChangeCount = 0;

      while (extractedComments.length < limit) {
        const tweetElements = await page.$$('article[data-testid="tweet"]');
        
        for (const el of tweetElements) {
          if (extractedComments.length >= limit) break;

          try {
            const tweetData = await page.evaluate((article) => {
              const textElement = article.querySelector('[data-testid="tweetText"]');
              const text = textElement ? (textElement as HTMLElement).innerText : '';
              
              const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
              const statusLink = links.find(l => l.getAttribute('href')?.includes('/status/')) as HTMLAnchorElement | undefined;
              
              const url = statusLink ? `https://twitter.com${statusLink.getAttribute('href')}` : '';
              const idMatch = url.match(/status\/(\d+)/);
              const id = idMatch ? idMatch[1] : '';

              const userElement = article.querySelector('[data-testid="User-Name"]');
              const authorText = userElement ? (userElement as HTMLElement).innerText : '';
              const authorLines = authorText.split('\\n');
              const authorName = authorLines[0] || '';
              const authorHandle = authorLines.find(l => l.startsWith('@')) || '';

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
              extractedComments.push(tweetData);
            }
          } catch (e) {
            // Element detached
          }
        }

        if (extractedComments.length < limit) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
          await new Promise(r => setTimeout(r, 2000));

          // Check if we have hit the bottom of the page to break the loop
          const newHeight = await page.evaluate(() => document.body.scrollHeight);
          if (newHeight === previousHeight) {
            noChangeCount++;
            if (noChangeCount > 2) {
              // We've tried scrolling multiple times with no new content, break the loop
              break;
            }
          } else {
            previousHeight = newHeight;
            noChangeCount = 0;
          }
        }
      }

      await browser.close();
      outputJson({ success: true, data: extractedComments });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError('General error while scraping comments', 3, { detail: error.message });
    }
  });
