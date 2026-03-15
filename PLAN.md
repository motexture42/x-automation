# X Automation CLI Plan

## Objective
Build an agentic AI-friendly command-line interface (CLI) for X automation. The CLI is designed specifically to be used as a reliable tool by external AI agents, providing predictable outputs (JSON), clear exit codes, and robust error handling. 

Given the strict limitations of the official X API (especially on the free tier) and the need for "stealth," this CLI will utilize browser automation with stealth plugins rather than relying on official API endpoints.

## Technology Stack
- **Language:** Node.js (TypeScript)
  - *Rationale for Stealth:* The Node.js ecosystem has the most mature tools for bypassing bot detection, specifically `puppeteer-extra-plugin-stealth`.
- **CLI Framework:** `commander` or `yargs` for parsing commands and flags.
- **Automation Engine:** `puppeteer` + `puppeteer-extra` + `puppeteer-extra-plugin-stealth`.
- **Output:** Structured JSON for seamless parsing by calling AI agents.

## Core Features (V1)

1. **Authentication (`x-cli auth`)**
   - **Interactive Login:** A command to launch a visible browser instance for manual login to handle captchas/2FA.
   - **Session Storage:** Saves the authenticated session cookies (`auth_token`, `ct0`) to a local `session.json` file. Subsequent commands run headlessly using this session.

2. **Post Tweets (`x-cli post`)**
   - Send single text tweets.
   - Support for creating threads (replying to the previously sent tweet in the chain).

3. **Read Timelines (`x-cli timeline`)**
   - Fetch the "For You" or "Following" timeline.
   - **Auto-Scrolling Limit:** Support a `--limit <number>` flag. The automation will scroll the feed until the specified number of tweets is reached.
   - **Data Extraction:** Extract and return a list containing the direct URL/link to the post, along with the tweet text, author, ID, and engagement metrics.

4. **Reply & Engage (`x-cli reply`, `x-cli like`, `x-cli retweet`)**
   - Reply to a specific tweet ID.
   - Like or Retweet a specific tweet ID.

5. **Search (`x-cli search`)**
   - Search for keywords, hashtags, or users and return structured results.

## "Agentic AI Friendly" Design Principles

- **JSON Output First:** All commands will support a `--json` flag (or default to JSON) so that STDOUT can be directly parsed by the calling LLM/Agent without regex scraping.
- **Predictable Exit Codes:** 
  - `0`: Success.
  - `1`: Authentication error (session expired).
  - `2`: Element not found / Automation timeout (X UI changed).
  - `3`: General error.
- **Standardized Error Output:** Errors will be printed to STDERR as JSON objects detailing the failure reason, making it easy for an agent to recover or report the issue.
- **Headless by Default:** All operational commands run entirely in the background (headless mode) unless explicitly debugged.

## Next Steps for Execution
1. Initialize the Node.js TypeScript project.
2. Install dependencies (`puppeteer`, `puppeteer-extra`, etc.).
3. Implement the base CLI structure and the Authentication/Session management module.
4. Implement the core browser automation functions (Post, Timeline, Reply, Search).
5. Add rigorous JSON output formatting and error handling.
6. Test comprehensively.

Please review this plan. If you approve, I will begin execution.