# Build System

This extension uses **native ES modules** without webpack or bundlers.

## Build Process

### Dependencies
- TypeScript (`tsc`) - Compiles `.ts` to `.js`
- Sass - Compiles `.scss` to `.css`
- Node.js - Runs build script

### Build Commands

```bash
# Full production build
npm run build

# Watch mode (auto-recompile TypeScript on changes)
npm run build:watch
```

### What the Build Does

1. **TypeScript Compilation**: Converts `src/ts/**/*.ts` → `dist/ts/**/*.js` as ES modules
2. **SCSS Compilation**: Converts `src/scss/*.scss` → `dist/css/*.css`
3. **Static File Copying**:
   - Manifest: `src/manifest_chrome.json` → `dist/manifest.json`
   - Icons: `src/icons/*` → `dist/icons/*`
   - HTML pages: `src/offscreen/offscreen.html`, `src/options/options.html`
4. **FFmpeg WASM**: Copies FFmpeg core files from `node_modules/@ffmpeg/core`
5. **Package Creation**: Copies everything to `zip/chrome/` for distribution

### Key Files

- `build-native.js` - Main build script
- `tsconfig.json` - TypeScript configuration
- `fix-imports.js` - Helper to add `.js` extensions to imports (required for ES modules)

## How ES Modules Work in Extensions

### Manifest V3 ES Module Support

Chrome extensions Manifest V3 supports ES modules via:

```json
{
  "background": {
    "service_worker": "ts/background/BackgroundMessageHandler.js",
    "type": "module"  // Enables ES module loading
  },
  "content_scripts": [{
    "js": ["ts/index.js"]  // Automatically treated as module
  }]
}
```

### Import Paths

ES modules require explicit `.js` extensions:

```typescript
// ✅ Correct
import { Foo } from './Foo.js';

// ❌ Wrong (works in bundlers, not native modules)
import { Foo } from './Foo';
```

The TypeScript compiler outputs `.js` files but doesn't change import paths, so we write `.js` extensions in `.ts` files.

## Advantages Over Webpack

1. **No Worker Path Issues**: FFmpeg workers load from correct extension URL
2. **Simpler Debugging**: Source maps point to actual files, not bundled code
3. **Faster Builds**: No bundling overhead
4. **Easier Maintenance**: No webpack configuration complexity
5. **Native Browser Features**: Uses browser's native module loader

## File Structure

```
src/
├── ts/              # TypeScript source
├── scss/            # Stylesheets
├── icons/           # Extension icons
├── manifest_chrome.json
├── offscreen/
│   └── offscreen.html
└── options/
    └── options.html

dist/                # Compiled output (gitignored)
└── (same structure as src, but .ts → .js)

zip/chrome/          # Final package
└── (copy of dist/)
```

## Development Workflow

1. Edit TypeScript files in `src/ts/`
2. Run `npm run build` or `npm run build:watch`
3. Load `zip/chrome/` as unpacked extension in Chrome
4. Reload extension after changes

## Migration from Webpack

Removed:
- `webpack.config.js`
- `src/build.js` (old webpack-based build)
- `src/global.js` (webpack polyfill)
- All webpack dependencies

Added:
- `tsconfig.json`
- `build-native.js`
- `fix-imports.js`
