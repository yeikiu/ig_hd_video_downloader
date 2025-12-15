const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const packageJson = require('./package.json');

const DIST_DIR = path.join(__dirname, 'zip/chrome');
const OUTPUT_DIR = path.join(__dirname, 'zip');
const ZIP_NAME = `ig-hd-downloader-v${packageJson.version}.zip`;
const OUTPUT_FILE = path.join(OUTPUT_DIR, ZIP_NAME);

if (!fs.existsSync(DIST_DIR)) {
    console.error(`Error: Dist directory ${DIST_DIR} does not exist. Run 'npm run build' first.`);
    process.exit(1);
}

// Create output directory structure if strictly necessary (zip/ exists but just to be safe)
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const output = fs.createWriteStream(OUTPUT_FILE);
const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
});

output.on('close', function () {
    console.log(`[Zip] Archive created: ${ZIP_NAME} (${archive.pointer()} total bytes)`);
});

archive.on('warning', function (err) {
    if (err.code === 'ENOENT') {
        console.warn('[Zip] Warning:', err);
    } else {
        throw err;
    }
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);

// Append files from DIST_DIR, putting them at the root of the zip
archive.directory(DIST_DIR, false);

archive.finalize();
