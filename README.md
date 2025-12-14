# Instagram HD Video Downloader

A minimal browser extension for downloading Instagram videos in the highest quality available, with automatic FFmpeg merging of video and audio tracks.

![Post Demo](.screenshots/single_post_demo.png)

## Features

- **HD Video Downloads**: Automatically downloads the highest quality video available
- **FFmpeg Integration**: Merges separate video and audio tracks in the browser using WebAssembly
- **Simple UI**: Download button appears next to share button on posts
- **Works Everywhere**: Timeline posts, detail pages, reels, and modals
- **Locale-Independent**: Works with Instagram in any language
- **Auto-Download**: Opens posts in new tab with automatic download trigger

## How It Works

1. Navigate to any Instagram post or reel with video
2. Click the download button (appears next to the share button)
3. The extension extracts the highest quality video and audio URLs
4. FFmpeg merges them in the browser
5. The merged video is automatically downloaded

## Technical Details

- **FFmpeg.wasm**: Video/audio merging happens entirely in the browser
- **Manifest V2**: Compatible with Chrome (for now), Brave, Edge, and Firefox
- **TypeScript**: Fully typed codebase
- **Webpack**: Bundled and optimized build

## Installation

### Development Build

```bash
npm install
npm run build:dev

# watch mode
npm run build:dev:w
```

The extension will be built to `zip/chrome/` and `zip/firefox/`

### Load in Browser

**Chrome/Brave/Edge:**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `zip/chrome/` folder

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` file from `zip/firefox/`

## Project Structure

```
src/
├── ts/
│   ├── components/       # Alert notifications
│   ├── downloaders/      # Download logic
│   ├── helper-classes/   # FFmpeg merger, DOM observers
│   ├── background/       # Background script message handler
│   └── models/           # TypeScript interfaces
├── scss/                 # Minimal alert styles
└── manifest_*.json       # Extension manifests
```

## How Videos Are Downloaded

1. **Detection**: Finds posts using locale-independent CSS selectors (SVG path matching)
2. **Extraction**: Parses Instagram's DASH manifest from page scripts
3. **Quality Selection**: Chooses highest bandwidth video and audio streams
4. **Merging**: Uses FFmpeg.wasm to combine video + audio
5. **Download**: Triggers browser download with merged file

## Browser Compatibility

- Chrome (for now but won't work with manifest V3)
- Brave (Extended Manifest V2 support)
- Firefox
