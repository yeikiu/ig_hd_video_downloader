const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST = path.resolve(__dirname, 'dist');
const SRC = path.resolve(__dirname, 'src');
const ZIP_DIR = path.resolve(__dirname, 'zip/chrome');

console.log('[Build] Starting native ES module build...');

// Clean dist directory
if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// Compile TypeScript to ES modules
console.log('[Build] Compiling TypeScript...');
execSync('npx tsc', { stdio: 'inherit' });

// Copy content-loader.js (not compiled by tsc since it's already JS)
const contentLoader = path.join(SRC, 'ts/content-loader.js');
if (fs.existsSync(contentLoader)) {
    fs.copyFileSync(contentLoader, path.join(DIST, 'ts/content-loader.js'));
}

// Replace bare imports with relative paths
console.log('[Build] Replacing bare imports...');
execSync('node replace-imports.js', { stdio: 'inherit' });

// Compile SCSS to CSS
console.log('[Build] Compiling SCSS...');
const scssDir = path.join(SRC, 'scss');
const cssDir = path.join(DIST, 'css');
fs.mkdirSync(cssDir, { recursive: true });

if (fs.existsSync(scssDir)) {
    const scssFiles = fs.readdirSync(scssDir).filter(f => f.endsWith('.scss'));
    scssFiles.forEach(file => {
        const inputFile = path.join(scssDir, file);
        const outputFile = path.join(cssDir, file.replace('.scss', '.css'));
        execSync(`npx sass ${inputFile} ${outputFile}`, { stdio: 'inherit' });
    });
}

// Copy static files
console.log('[Build] Copying static files...');

// Copy manifest
fs.copyFileSync(
    path.join(SRC, 'manifest_chrome.json'),
    path.join(DIST, 'manifest.json')
);

// Copy content-script-loader.js
fs.copyFileSync(
    path.join(SRC, 'content-script-loader.js'),
    path.join(DIST, 'content-script-loader.js')
);

// Copy icons
const iconsDir = path.join(SRC, 'icons');
if (fs.existsSync(iconsDir)) {
    const distIconsDir = path.join(DIST, 'icons');
    fs.mkdirSync(distIconsDir, { recursive: true });
    fs.readdirSync(iconsDir).forEach(file => {
        fs.copyFileSync(
            path.join(iconsDir, file),
            path.join(distIconsDir, file)
        );
    });
}

// Copy node_modules dependencies that are imported
console.log('[Build] Copying node_modules dependencies...');
const nodeModulesDir = path.join(DIST, 'node_modules');

// Copy webextension-polyfill UMD file
const polyfillSrc = path.join(__dirname, 'node_modules/webextension-polyfill/dist/browser-polyfill.js');
const polyfillDestDir = path.join(nodeModulesDir, 'webextension-polyfill');
fs.mkdirSync(polyfillDestDir, { recursive: true });
fs.copyFileSync(polyfillSrc, path.join(polyfillDestDir, 'browser-polyfill.umd.js'));

// Create ES module wrapper for webextension-polyfill
const polyfillESM = `// ES Module wrapper for webextension-polyfill
import './browser-polyfill.umd.js';
const globalThis = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : global);
export default globalThis.browser || globalThis.chrome;
`;
fs.writeFileSync(path.join(polyfillDestDir, 'index.js'), polyfillESM);

// Create package.json
fs.writeFileSync(
    path.join(polyfillDestDir, 'package.json'),
    JSON.stringify({ type: "module", main: "./index.js", exports: { ".": "./index.js" } })
);

// Copy @ffmpeg packages
const ffmpegPackages = ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'];
ffmpegPackages.forEach(pkg => {
    const srcPkg = path.join(__dirname, 'node_modules', pkg);
    const destPkg = path.join(nodeModulesDir, pkg);
    if (fs.existsSync(srcPkg)) {
        copyRecursive(srcPkg, destPkg);
    }
});

// Copy FFmpeg WASM files to lib (for web_accessible_resources)
const ffmpegCoreDir = path.join(__dirname, 'node_modules/@ffmpeg/core/dist/esm');
const libDir = path.join(DIST, 'lib');
fs.mkdirSync(libDir, { recursive: true });

['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'].forEach(file => {
    const src = path.join(ffmpegCoreDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(libDir, file));
    }
});

// Copy options HTML
const optionsHtml = path.join(SRC, 'options/options.html');
if (fs.existsSync(optionsHtml)) {
    fs.copyFileSync(optionsHtml, path.join(DIST, 'options.html'));
}

// Copy offscreen HTML with import map
const offscreenHtml = path.join(SRC, 'offscreen/offscreen.html');
if (fs.existsSync(offscreenHtml)) {
    fs.copyFileSync(offscreenHtml, path.join(DIST, 'offscreen.html'));
}

// Create ZIP package
console.log('[Build] Creating Chrome extension package...');
if (fs.existsSync(ZIP_DIR)) {
    fs.rmSync(ZIP_DIR, { recursive: true });
}
fs.mkdirSync(ZIP_DIR, { recursive: true });

// Copy everything from dist to zip/chrome
function copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(file => {
            copyRecursive(path.join(src, file), path.join(dest, file));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

copyRecursive(DIST, ZIP_DIR);

console.log('[Build] Build complete! Extension ready at:', ZIP_DIR);
