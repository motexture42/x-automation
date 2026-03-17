import { Command } from 'commander';
import { launchBrowser } from '../utils/browser';
import { restoreSession } from '../utils/session';
import { outputJson, outputError } from '../utils/logger';

export const followCommand = new Command('follow')
  .description('Follow a specific user')
  .requiredOption('-u, --username <username>', 'Username of the account to follow (without @)')
  .option('--headless <boolean>', 'Run in headless mode', 'true')
  .action(async (options) => {
    // Allow user to control headless mode, defaults to true
    const headless = options.headless !== 'false';
    const username = options.username.replace(/^@/, '');

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

      await page.goto(`https://twitter.com/${username}`, { waitUntil: 'domcontentloaded' });

      try {
        // Wait for profile column to load
        await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 15000 });
        // Give it a brief moment to load the follow button state fully
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        if (page.url().includes('login')) {
          outputError('Session expired or invalid.', 1);
        } else {
          outputError(`Could not find the profile for @${username}.`, 2);
        }
        if (browser) await browser.close();
        return;
      }

      // Check if already following or click follow
      const result = await page.evaluate(async (u) => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        
        // Find the "Following" button to check if already following
        const followingBtn = buttons.find(b => {
            const ariaLabel = b.getAttribute('aria-label') || '';
            const text = b.textContent?.trim() || '';
            // Account for different variations
            return ariaLabel.startsWith('Following @') || text === 'Following';
        }) as HTMLElement;

        if (followingBtn) {
            return { success: true, alreadyFollowing: true };
        }

        // Find the "Follow" button to click
        const followBtn = buttons.find(b => {
            const ariaLabel = b.getAttribute('aria-label') || '';
            const text = b.textContent?.trim() || '';
            return ariaLabel.startsWith('Follow @') || text === 'Follow';
        }) as HTMLElement;

        if (followBtn) {
            followBtn.click();
            return { success: true, alreadyFollowing: false };
        }

        return { success: false, reason: 'Follow button not found. You might be blocked or the account does not exist.' };
      }, username);

      if (!result.success) {
         outputError(`Failed to follow @${username}: ${result.reason}`, 2);
         if (browser) await browser.close();
         return;
      }

      if (!result.alreadyFollowing) {
         // Wait a moment for the request to go through
         await new Promise(r => setTimeout(r, 2000));
      }

      await browser.close();
      outputJson({ 
        success: true, 
        message: result.alreadyFollowing ? `Already following @${username}.` : `Successfully followed @${username}.`,
        alreadyFollowing: result.alreadyFollowing
      });

    } catch (error: any) {
      if (browser) await browser.close();
      outputError(`General error while following @${options.username}`, 3, { detail: error.message });
    }
  });
