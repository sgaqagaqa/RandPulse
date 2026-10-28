# RandPulse: setup in 6 steps (no Terminal, no coding, free)

RandPulse is the money version of CyberPulse: the rand, gold, platinum, oil, JSE shares, world
markets, South African economy figures and finance news, plus ideas to build wealth and
opportunity in South Africa. It is a separate app with its own link, so your CyberPulse stays as it is.

Information only. It is not financial advice.

## 1. Make a new repository
- On github.com click the **+** at the top right, then **New repository**.
- Name it exactly: `randpulse`
- Choose **Public**, then click **Create repository**.

## 2. Upload the files
- Unzip the RandPulse zip on your Mac.
- On your new repository page click **uploading an existing file**.
- Open the unzipped `RandPulse-upload` folder, press **Cmd + A** to select everything inside it
  (4 folders and this README), and drag it all onto the GitHub page.
- Wait for the upload bar to finish, then click the green **Commit changes** button.

## 3. Check it landed in the right place
Your repository's front page should show these four folders and the README:
`backend`, `step3-paste-this`, `web`, `widget`.
If you see `index.html`, `app.js` or `style.css` sitting loose on the front page instead,
the files went to the wrong place. Delete them and upload again by dragging the folders,
not the files inside them.

## 4. Add the schedule file (one copy and paste)
GitHub hides this file when uploading, so add it by hand:
- Click **Add file**, then **Create new file**.
- In the name box type exactly: `.github/workflows/build-feed.yml`
  (typing the `/` makes the folders for you)
- Open `step3-paste-this/build-feed.yml` from the unzipped folder in TextEdit,
  press Cmd + A, Cmd + C. Click the big text box on GitHub and paste (Cmd + V).
- Click **Commit changes**, then **Commit changes** again.

## 5. Start it for the first time
- Click the **Actions** tab. If GitHub asks, click the button to enable workflows.
- Click **Build RandPulse feed** on the left, then **Run workflow**, then the green **Run workflow** button.
- Wait about 1 to 2 minutes and refresh until you see a green tick.

## 6. Turn on your website
- Click **Settings**, then **Pages** on the left.
- Under "Branch" choose **data**, keep the folder as **/ (root)**, and click **Save**.
- Wait 1 to 2 minutes. Your app is at:
  **https://sgaqagaqa.github.io/randpulse/**

Open that link on your iPhone in Safari, tap **Share**, then **Add to Home Screen**.
On your Mac open it in Safari, then **File > Add to Dock**.

It updates itself every hour, and the app refreshes itself every 5 minutes while open.

---

## What is inside
- **Home:** a price strip (rand, gold in rand, platinum, Brent, JSE, S&P 500) and the news feed.
  Hour, Day, Week and Year views, and filters for Breaking, South Africa, Rand and rates, Stocks,
  Gold, platinum and oil, Empowerment, and public Posts.
- **Markets:** about 45 prices with charts you can touch or hover over, a 1M / 3M / 6M / 1Y range,
  a watchlist, and a place to write your own thoughts on any price.
- **South Africa:** the economy at a glance (inflation, unemployment, growth, debt and more),
  ideas to build wealth and opportunity, and South African stories.
- **Saved** and **My thoughts:** everything you bookmarked or wrote, in one place.

## iPhone widgets (optional, 3 minutes)
A web page can't be an iPhone widget, so this uses the free **Scriptable** app.
1. Install **Scriptable** from the App Store.
2. Open `widget/RandPulse.scriptable.js` in TextEdit. Your GitHub name is already filled in. Copy the whole file.
3. In Scriptable tap **+**, paste, and name it `RandPulse`.
4. **Lock screen:** press and hold the lock screen, tap **Customize**, add a **Scriptable** widget,
   tap it and choose Script: RandPulse. **Home screen:** press and hold, tap **+**, choose Scriptable,
   then tap the widget and choose Script: RandPulse.

Widgets refresh roughly every 30 minutes (iOS decides the exact timing), so they are not live to the second.

## Alerts for big moves (optional)
Install the free **ntfy** app and subscribe to a long random topic name (for example `rp-8f3k29x7q1`).
Then on GitHub go to Settings, Secrets and variables, Actions, New repository secret.
Name it `NTFY_TOPIC` and paste the same topic name as the value. You will then get a notification
for breaking stories and big moves (for example the rand moving more than 1% in a day).

## If something goes wrong
- **Actions shows a red cross:** click it and send me a screenshot or the error text.
- **The link says 404:** wait 2 minutes, then check Settings > Pages shows branch `data`.
- **The Markets tab says "No prices yet":** run Build RandPulse feed again and wait for the green tick.
- **Some prices say "delayed":** that source did not answer this hour. The app keeps the last price it got.
- **The site looks old after an update:** open it in a private window. On iPhone, delete the
  home-screen icon and add it again.

## Good to know
- Prices come from Yahoo Finance (with Stooq as a backup) and can be delayed by about 15 minutes.
- Economy figures come from the World Bank and are annual, so they lag. For monthly numbers use Stats SA and the Reserve Bank.
- The ideas are picked by simple rules from each week's news and prices, not by AI. They are starting points, not advice.
- Your saves, thoughts and watchlist stay on the device where you made them. Use **Back up** to move them.
- You can add or remove news sources by editing `backend/sources.json` on GitHub (click the file, then the pencil icon).
