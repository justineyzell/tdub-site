# TDub - setup guide (plain steps)

TDub is a small website. It has three parts:

- **Library (home page)**: shows the series in rows, like a shop shelf.
- **Series page**: pick a series, see its episodes, pick one.
- **Watch page**: the built-in video player, with a quality menu.
- **Admin page** (`/admin`): only you can open it, with your password. You add series and episodes here.

Videos are **not** stored on this site. You keep them in your cloud storage
(for example Google Drive, Dropbox, Cloudflare R2, Backblaze B2, or any host
that gives a direct link to the file). You paste the links into the admin page.

## 1. What you need

- **Node.js** version 18 or newer (you have it). Download from nodejs.org if you ever need it.
- A place to put the site online later, for example Render, Railway or a VPS.

## 2. Turn it on on your computer

1. Open a terminal in the `tdub-site` folder.
2. Set your admin password and start the site. On Windows PowerShell:

   ```
   $env:ADMIN_PASSWORD = "choose-a-long-private-password"
   node server.js
   ```

   On Mac or Linux:

   ```
   ADMIN_PASSWORD="choose-a-long-private-password" node server.js
   ```

3. Open `http://localhost:3000` to see the library.
4. Open `http://localhost:3000/admin` to add content.

Use a long password. Never put it inside the code files, and never share it.

## 3. Add a series and episodes

1. Go to `/admin` and log in.
2. Click **+ New series**, fill in the title, description, genres and picture links, then **Save series**.
3. Click **Open** on the series. Click **+ Add episode**.
4. Type the season and episode number.
5. Paste one or more **video links** (one per quality you have). Links must start with `https://`.
6. Click **Save episode**.

A video link must point straight at the video file (it usually ends in `.mp4`). A normal share page link from Google Drive will not play; use a direct download link from your storage provider.

## 4. Put the Google ad strip on

1. Make an account at Google AdSense and get your publisher ID (`ca-pub-...`).
2. Create an ad unit set to **Display ad**, and copy its slot number.
3. Open `public/js/config.js` and fill in `client` and `slot`.
4. Save the file. The thin ad strip at the bottom of each page now shows ads.

Until you fill these in, the strip stays empty and no Google code loads.

## 5. Put the site online

1. Upload the `tdub-site` folder to a host that runs Node.js.
2. Set the environment setting `ADMIN_PASSWORD` in the host's settings (never in the code).
3. The start command is `node server.js`. Most hosts also set `PORT` for you.
4. Point your domain (the TDub name) to the host, and turn on HTTPS.

Your data is saved in `data/catalog.json`. Back this file up now and then.

## 6. Good to know

- The admin page is hidden from search engines and needs your password.
- After 10 wrong passwords, the admin page waits 15 minutes before it tries again.
- Viewers pick the video quality from the menu on the player. Their choice is remembered.
- The site uses only the built-in parts of Node.js, so there is nothing else to install.
