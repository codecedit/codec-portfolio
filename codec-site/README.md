# codec portfolio

Open `index.html` in a browser to preview. No build step, no installs.

## Add your videos

Each video card in `index.html` has two attributes:

- `data-src="videos/01-youtube-documentary-style.mp4"` — a file you host yourself. Put the MP4 in the `videos/` folder with that exact name.
- `data-yt="VIDEO_ID"` — a YouTube embed (the ID is the part after `v=` in the link). If you use this, leave `data-src` empty.

Videos autoplay muted and loop while on screen, and pause when scrolled away. Visitors click the sound button to unmute; only one video has sound at a time. If a file is missing, the card just shows its poster image.

### Which one to use

- **Short loops (recommended):** export a 10-30 second MP4 per project and drop it in `videos/`. Fast, no YouTube branding, and the sound button works everywhere. Keep each file small (about 10-15 MB or less); some hosts cap file size.
- **Full-length videos:** upload to YouTube (unlisted is fine) and use `data-yt`. All six cards are currently set up this way.

**YouTube only plays from a web address.** If you double-click `index.html` (a `file://` address) YouTube shows "Error 153 - video player configuration error". That is expected: YouTube needs to know which site is embedding it. It works once the site is hosted, or when you preview locally with a tiny server. In this folder run `python3 -m http.server 8000` and open http://localhost:8000. If a single video still refuses to play after the site is hosted, open it in YouTube Studio and check that "Allow embedding" is on.

Export tip (720p, small, streams quickly):

    ffmpeg -i input.mp4 -vf scale=-2:720 -c:v libx264 -crf 24 -preset slow -c:a aac -b:a 128k -movflags +faststart output.mp4

## Replace the placeholders

- Posters: `assets/posters/` (currently cropped from your design render; swap in sharp frames from each video, same file names).
- Creator links: the four channel URLs are in the `creators` section of `index.html` (edit the `href` values).
- Email: on computers, the email links open a Gmail compose window in a new tab (a plain `mailto:` link does nothing when no mail app is set up). On phones they open the default mail app.

## Hosting the site

Upload the whole folder to Netlify (drag and drop), Cloudflare Pages or GitHub Pages. All fonts are bundled, so nothing loads from third parties except YouTube embeds if you use them.
