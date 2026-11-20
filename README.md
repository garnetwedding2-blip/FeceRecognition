# Selfie Finder

Browser-only face-matching demo: upload a selfie, point it at a Google Drive folder (or a local folder), and see every photo containing that person. Face detection/matching runs locally with [face-api.js](https://github.com/vladmandic/face-api); no server is needed.

## Files

```
selfie-finder/
├── index.html      page structure
├── css/style.css   styling
├── js/app.js       app logic
├── config.json     settings (model URL, thresholds, Google client ID, ...)
├── .nojekyll       tells GitHub Pages to serve files as-is
└── README.md
```

## Deploy on GitHub Pages

1. Create a new public repo, e.g. `selfie-finder`.
2. Upload the **contents** of this folder to the repo root (so `index.html` is at the top level).
3. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/selfie-finder/`.

## Google Drive setup (one-time)

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External → add your Google account as a *test user*.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. **Authorized JavaScript origins**: add `https://YOUR-USERNAME.github.io` (origin only, no `/selfie-finder` path). Add `http://localhost:8000` for local testing.
6. Copy the Client ID and either paste it into the page, or set it in `config.json` → `google.clientId`. (A Client ID is not a secret; never put a client *secret* in this project.)

The app requests only the read-only scope `drive.readonly`.

## Local testing

```
python3 -m http.server 8000
```
Then open http://localhost:8000. (Opening `index.html` directly with `file://` will not work: `config.json`, the webcam and Google sign-in need http(s).)

## config.json

| Key | Meaning |
|---|---|
| `model.url` | where the face-api.js model weights are loaded from |
| `matching.defaultThreshold` | face distance cut-off (lower = stricter; ~0.5 is typical) |
| `matching.minThreshold` / `maxThreshold` / `step` | slider range |
| `image.maxDimension` | photos are downscaled to this size before analysis (speed) |
| `google.clientId` | pre-fills the OAuth Client ID |
| `google.includeSubfoldersByDefault` | default for the sub-folder checkbox |
| `export.csvFileName` | name of the exported CSV |

## Notes

- Needs internet: libraries and models load from jsDelivr, sign-in from Google.
- Accuracy depends on photo quality; blurry, tiny, side-on or masked faces can be missed. Treat results as suggestions.
- Large folders are slow because everything runs in the browser.
- Use only on photos you have the right to search and with the consent of the people in them.
