# X Automation CLI (Agentic AI Friendly) 🤖

A robust, stealthy command-line interface for X automation. Designed specifically to be used as a reliable tool by external AI agents, bypassing the strict limitations of the official X API using browser automation with advanced anti-bot evasion techniques.

## Why this exists?
The official X API is heavily rate-limited and prohibitively expensive for most AI agent workflows. This CLI bridges the gap by providing a reliable wrapper around X's web interface. 

It guarantees **structured JSON output**, **predictable exit codes**, and uses **dynamic browser visibility** to successfully evade X's strict WebGL/Canvas bot detection while minimizing user interruption.

## Features (V1)
- 🔐 **Persistent Authentication** (Saves session cookies locally).
- 📜 **Read Timelines** (Scrolls and extracts your "For You" or "Following" feed).
- 🔍 **Search** (Finds tweets by keyword, user, or hashtag).
- 💬 **Scrape Comments** (Extracts replies from a specific tweet thread).
- ✍️ **Post Tweets** (Bypasses bot detection using hardware rendering and keyboard shortcuts).
- ↩️ **Reply to Tweets** (Reply to posts or other comments).
- 👍 **Like & Retweet** (Interact with specific tweets).
- 🤝 **Follow Users** (Follow accounts directly or chained through interactions).
- 🔗 **Chain Interactions** (Like, retweet, reply, and follow in a single session).

---

## 🚀 Installation & Setup

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Build the CLI:**
   ```bash
   npm run build
   ```

3. **Link the CLI globally (Optional):**
   ```bash
   npm link
   ```
   *This allows you to run `x-cli` from anywhere. Otherwise, use `npm run start -- <command>`.*

---

## 🔑 Authentication

Before using the CLI, you must authenticate. This command launches a visible browser window where you can manually log in, solving any Captchas or 2FA prompts naturally.

```bash
x-cli auth
```
Once you reach the home timeline, the CLI automatically saves your `auth_token` and `ct0` cookies to a local `session.json` file. All subsequent commands will use this session automatically.

---

## 📖 Commands & Usage

All commands output structured JSON to `stdout` for seamless parsing by calling LLMs, and output errors to `stderr`.

### 1. Read Timelines (`timeline`)
Scrolls the timeline and extracts a specified number of tweets. **Runs completely invisibly in the background.**

```bash
x-cli timeline -l 10
# OR read the "Following" tab:
x-cli timeline -t following -l 5
```

### 2. Search Tweets (`search`)
Searches X for a query and extracts the results. **Runs completely invisibly in the background.**
You can specify the sort order using the `-s` flag (`top` or `latest`). Default is `top`.

```bash
# Top results (default)
x-cli search -q "Agentic AI" -l 3

# Latest results
x-cli search -q "Agentic AI" -s latest -l 3
```

### 3. Scrape Comments (`comments`)
Navigates to a specific tweet and extracts the replies underneath it. **Runs completely invisibly in the background.**

```bash
x-cli comments -i 1234567890123456789 -l 5
```

### 4. Post a Tweet (`post`)
Posts a new tweet or a threaded series of tweets. You can optionally attach an image or video using the `-m` flag (attaches to the first tweet).
*Note: Due to X's aggressive bot detection on Write actions, this command briefly flashes a visible Chrome window to utilize hardware graphics rendering, types the tweet, submits it via keyboard shortcut, and closes instantly.*

```bash
x-cli post -t "Hello world from my AI agent! 🤖"
# With an image:
x-cli post -t "Check out this image!" -m "./path/to/image.png"
# Create a thread (pass multiple strings):
x-cli post -t "This is the first tweet in the thread." "This is the second tweet." "And the third one."
```

### 5. Reply to a Tweet (`reply`)
Replies to a specific tweet or comment by ID. You can also optionally attach media.
*Note: Like posting, this briefly flashes a visible window to evade detection.*

```bash
x-cli reply -i 1234567890123456789 -t "This is a great point!"
# With an image:
x-cli reply -i 1234567890123456789 -t "Here is proof:" -m "./proof.jpg"
```

### 6. Fetch Tweet Analytics (`analytics`)
Fetches engagement metrics (views, likes, retweets, replies, bookmarks) for a specific tweet by ID. **Runs completely invisibly in the background.**

```bash
x-cli analytics -i 1234567890123456789
```

*Example Output:*
```json
{
  "success": true,
  "data": {
    "id": "1234567890123456789",
    "text": "The content of the tweet",
    "metrics": {
      "replies": "10",
      "retweets": "2",
      "likes": "105",
      "bookmarks": "5",
      "views": "5,832"
    }
  }
}
```

### 7. Like a Tweet (`like`)
Likes a specific tweet by its ID. 
*Note: This flashes a visible window briefly to evade bot detection.*

```bash
x-cli like -i 1234567890123456789
```

### 8. Retweet / Repost (`retweet`)
Retweets (Reposts) a specific tweet by its ID.
*Note: This flashes a visible window briefly to evade bot detection.*

```bash
x-cli retweet -i 1234567890123456789
```

### 9. Follow a User (`follow`)
Follows a specific user by their handle (username).
*Note: This flashes a visible window briefly to evade bot detection.*

```bash
x-cli follow -u target_username
# With or without the @ works:
x-cli follow -u @target_username
```

### 10. Chain Interactions (`interact`)
Performs multiple actions on a single tweet within a single browser session (Like, Retweet, Reply, and Follow the author). This is significantly faster and safer than running individual commands back-to-back.
*Note: This flashes a visible window briefly to evade bot detection.*

```bash
# Like, retweet, and reply all at once
x-cli interact -i 1234567890123456789 -l -r --reply "This is a great thread!"

# Like and follow the author
x-cli interact -i 1234567890123456789 -l -f
```

---

## 🤖 Guide for AI Agents

If you are an AI agent using this CLI, here is what you need to know:

### Exit Codes
- `0`: Success. You can safely parse `stdout` as JSON.
- `1`: Authentication error. The `session.json` is expired or missing. Instruct the user to run `x-cli auth`.
- `2`: Element not found / Automation timeout. X's UI may have changed, or the tweet was deleted.
- `3`: General execution error. Parse `stderr` as JSON for details.

### Standard Output Format
Success responses will always follow this format:
```json
{
  "success": true,
  "data": [ ... ], 
  "message": "Optional status message",
  "tweetIds": ["1234567890123456789"] // (Only returned by 'post' and 'reply' commands)
}
```

### Data Extraction Structure
When reading timelines, searching, or scraping comments, the `data` array contains objects shaped like this:
```json
{
  "id": "2033206339414175998",
  "url": "https://twitter.com/username/status/2033206339414175998",
  "text": "The content of the tweet",
  "author": {
    "name": "Display Name\n@username\n·\n10m",
    "handle": "@username"
  },
  "metrics": {
    "replies": "10",
    "retweets": "2",
    "likes": "105",
    "views": "5K"
  }
}
```

## 🛡️ Stealth Architecture
This CLI uses `puppeteer-extra-plugin-stealth` combined with the user's actual local Google Chrome binary. 
- **Read Operations** (`timeline`, `search`, `comments`) bypass detection easily and run in Chrome's native `new` headless mode (100% invisible).
- **Write Operations** (`post`, `reply`) are strictly monitored by X's Canvas/WebGL fingerprinting. To ensure a 0% ban rate, these commands intentionally run in `headful` (visible) mode for ~2 seconds. Furthermore, traditional `.click()` automation on the Post button is blocked by X, so the CLI utilizes simulated `Cmd+Enter` / `Ctrl+Enter` keyboard shortcuts to submit data naturally.

---

## ⚠️ Disclaimer
**This tool is built for educational purposes.** 
Automated scraping and botting violate X/X's Terms of Service. While this tool uses advanced stealth techniques to bypass automated detection, you use it entirely at your own risk. The creator is not responsible for any account bans, suspensions, or restrictions that may occur. Please use responsibly!