import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';
import path from 'path';
import fs from 'fs';

export const interactCommand = new Command('interact')
  .description('Interact with a tweet (like, retweet, reply, follow) in a single session')
  .requiredOption('-i, --id <id>', 'ID of the tweet to interact with')
  .option('-l, --like', 'Like the tweet')
  .option('-r, --retweet', 'Retweet the tweet')
  .option('--reply <text>', 'Text content to reply with')
  .option('-f, --follow', 'Follow the author of the tweet')
  .option('-m, --media <path>', 'Path to an image or video to attach to the reply')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    // Force headless to false for write operations to avoid bot detection
    const headless = false;
    const tweetId = options.id;
    const shouldLike = options.like || false;
    const shouldRetweet = options.retweet || false;
    const replyText = options.reply;
    const shouldFollow = options.follow || false;
    const mediaPath = options.media ? path.resolve(process.cwd(), options.media) : null;

    if (!shouldLike && !shouldRetweet && !replyText && !shouldFollow) {
      outputError('No actions specified. Use --like, --retweet, --reply, or --follow.', 1);
      return;
    }

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

      await page.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'domcontentloaded' });

      // Give extra time for page to render
      await new Promise(r => setTimeout(r, 5000));

      // Wait for tweet to load
      try {
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000)); // give it time to fully render
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        }
        outputError('Could not find the tweet. It might be deleted or UI changed.', 2);
        if (browser) await browser.close();
        return;
      }

      const results: any = { success: true, message: `Completed interactions for tweet ${tweetId}.`, actions: {} };

      // ACTION 1: LIKE
      if (shouldLike) {
        try {
          const result = await page.evaluate(async (id) => {
            const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            let targetArticle = articles.find(a => {
                const links = Array.from(a.querySelectorAll('a[href*="/status/"]'));
                return links.some(l => l.getAttribute('href')?.includes(`/status/${id}`));
            });
            if (!targetArticle && articles.length > 0) targetArticle = articles[0];
            if (!targetArticle) return { success: false, reason: 'Tweet not found in DOM' };

            const unlikeBtn = targetArticle.querySelector('[data-testid="unlike"]') as HTMLElement;
            if (unlikeBtn) return { success: true, alreadyLiked: true };

            const likeBtn = targetArticle.querySelector('[data-testid="like"]') as HTMLElement;
            if (likeBtn) {
                likeBtn.click();
                return { success: true, alreadyLiked: false };
            }
            return { success: false, reason: 'Like button not found' };
          }, tweetId);

          if (!result.success) {
             results.actions.like = { success: false, reason: result.reason };
          } else {
             results.actions.like = { success: true, alreadyLiked: result.alreadyLiked };
             if (!result.alreadyLiked) await new Promise(r => setTimeout(r, 1000));
          }
        } catch (e: any) {
          results.actions.like = { success: false, reason: e.message };
        }
      }

      // ACTION 2: RETWEET
      if (shouldRetweet) {
        try {
          const result = await page.evaluate(async (id) => {
            const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            let targetArticle = articles.find(a => {
                const links = Array.from(a.querySelectorAll('a[href*="/status/"]'));
                return links.some(l => l.getAttribute('href')?.includes(`/status/${id}`));
            });
            if (!targetArticle && articles.length > 0) targetArticle = articles[0];
            if (!targetArticle) return { success: false, reason: 'Tweet not found in DOM' };

            const unretweetBtn = targetArticle.querySelector('[data-testid="unretweet"]') as HTMLElement;
            if (unretweetBtn) return { success: true, alreadyRetweeted: true };

            const retweetBtn = targetArticle.querySelector('[data-testid="retweet"]') as HTMLElement;
            if (retweetBtn) {
                retweetBtn.click();
                return { success: true, alreadyRetweeted: false, clicked: true };
            }
            return { success: false, reason: 'Retweet button not found' };
          }, tweetId);

          if (!result.success) {
             results.actions.retweet = { success: false, reason: result.reason };
          } else {
             if (!result.alreadyRetweeted && result.clicked) {
                await page.waitForSelector('[data-testid="retweetConfirm"]', { timeout: 5000 });
                await page.evaluate(() => {
                    const confirmBtn = document.querySelector('[data-testid="retweetConfirm"]') as HTMLElement;
                    if (confirmBtn) confirmBtn.click();
                });
                await new Promise(r => setTimeout(r, 1000));
             }
             results.actions.retweet = { success: true, alreadyRetweeted: result.alreadyRetweeted };
          }
        } catch (e: any) {
          results.actions.retweet = { success: false, reason: e.message };
        }
      }

      // ACTION 3: REPLY
      if (replyText) {
        try {
          const createdTweetIds: string[] = [];
          const responseHandler = async (response: any) => {
            const url = response.url();
            if (url.includes('CreateTweet') && response.status() === 200) {
              try {
                const json = await response.json();
                const tweetResult = json?.data?.create_tweet?.tweet_results?.result;
                if (tweetResult && tweetResult.rest_id) {
                  createdTweetIds.push(tweetResult.rest_id);
                }
              } catch (e) {}
            }
          };
          page.on('response', responseHandler);

          await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 15000 });

          if (mediaPath) {
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
          }

          await page.click('[data-testid="tweetTextarea_0"]');
          await page.type('[data-testid="tweetTextarea_0"]', replyText, { delay: 100 });

          await new Promise(r => setTimeout(r, 1000));
          await page.waitForFunction(() => {
            const btn = document.querySelector('[data-testid="tweetButtonInline"]');
            return btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
          }, { timeout: 10000 });

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

          try {
            await page.waitForSelector('[data-testid="toast"]', { timeout: 15000 });
          } catch (e) {
            await new Promise(r => setTimeout(r, 3000));
          }

          page.off('response', responseHandler);
          results.actions.reply = { success: true, tweetIds: createdTweetIds };

        } catch (e: any) {
          results.actions.reply = { success: false, reason: e.message };
        }
      }

      // ACTION 4: FOLLOW
      if (shouldFollow) {
        try {
          const result = await page.evaluate(async (id) => {
            const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
            let targetArticle = articles.find(a => {
                const links = Array.from(a.querySelectorAll('a[href*="/status/"]'));
                return links.some(l => l.getAttribute('href')?.includes(`/status/${id}`));
            });
            if (!targetArticle && articles.length > 0) targetArticle = articles[0];
            if (!targetArticle) return { success: false, reason: 'Tweet not found in DOM' };
            
            // Look for a follow button on the tweet itself
            const buttons = Array.from(targetArticle.querySelectorAll('button, [role="button"]'));
            const followBtn = buttons.find(b => {
                const ariaLabel = b.getAttribute('aria-label') || '';
                const text = b.textContent?.trim() || '';
                return ariaLabel.startsWith('Follow @') || text === 'Follow';
            }) as HTMLElement;

            if (followBtn) {
               followBtn.click();
               return { success: true, alreadyFollowing: false, clicked: true, method: 'inline' };
            }
            
            // Check if already following from inline button
            const followingBtn = buttons.find(b => {
                const ariaLabel = b.getAttribute('aria-label') || '';
                const text = b.textContent?.trim() || '';
                return ariaLabel.startsWith('Following @') || text === 'Following';
            }) as HTMLElement;

            if (followingBtn) {
               return { success: true, alreadyFollowing: true, method: 'inline' };
            }

            // Fallback: extract username to navigate to profile
            const userLinks = Array.from(targetArticle.querySelectorAll('a[href^="/"][role="link"]'));
            let username = null;
            for (const link of userLinks) {
                const href = link.getAttribute('href');
                if (href && href.startsWith('/') && href.split('/').length === 2) {
                    username = href.replace('/', '');
                    // Verify it's not a standard path
                    if (!['home', 'explore', 'notifications', 'messages', 'search'].includes(username.toLowerCase())) {
                       break;
                    } else {
                       username = null;
                    }
                }
            }

            if (username) {
                return { success: true, method: 'navigate', username };
            }

            return { success: false, reason: 'Could not determine author username or find follow button' };
          }, tweetId);

          if (!result.success) {
             results.actions.follow = { success: false, reason: result.reason };
          } else if (result.method === 'inline') {
             results.actions.follow = { success: true, alreadyFollowing: result.alreadyFollowing };
             if (!result.alreadyFollowing) await new Promise(r => setTimeout(r, 1000));
          } else if (result.method === 'navigate' && result.username) {
             await page.goto(`https://twitter.com/${result.username}`, { waitUntil: 'domcontentloaded' });
             await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 15000 });
             await new Promise(r => setTimeout(r, 2000));

             const followResult = await page.evaluate(async (u) => {
                const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
                const followingBtnProfile = btns.find(b => {
                    const ariaLabel = b.getAttribute('aria-label') || '';
                    const text = b.textContent?.trim() || '';
                    return ariaLabel.startsWith('Following @') || text === 'Following';
                }) as HTMLElement;
                if (followingBtnProfile) return { success: true, alreadyFollowing: true };

                const followBtnProfile = btns.find(b => {
                    const ariaLabel = b.getAttribute('aria-label') || '';
                    const text = b.textContent?.trim() || '';
                    return ariaLabel.startsWith('Follow @') || text === 'Follow';
                }) as HTMLElement;

                if (followBtnProfile) {
                    followBtnProfile.click();
                    return { success: true, alreadyFollowing: false };
                }
                return { success: false, reason: 'Follow button not found on profile' };
             }, result.username);

             results.actions.follow = followResult;
             if (followResult.success && !followResult.alreadyFollowing) {
                 await new Promise(r => setTimeout(r, 2000));
             }
          }
        } catch (e: any) {
          results.actions.follow = { success: false, reason: e.message };
        }
      }

      await browser.close();
      outputJson(results);

    } catch (error: any) {
      if (browser) await browser.close();
      outputError(`General error while interacting with tweet ${options.id}`, 3, { detail: error.message });
    }
  });