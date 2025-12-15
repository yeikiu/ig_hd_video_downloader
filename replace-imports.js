const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, 'dist');
const NODE_MODULES = 'node_modules';

// Map of bare imports to their location in dist/node_modules
const IMPORT_MAP = {
    'webextension-polyfill': 'webextension-polyfill/index.js',
    '@ffmpeg/ffmpeg': '@ffmpeg/ffmpeg/dist/esm/index.js',
    '@ffmpeg/util': '@ffmpeg/util/dist/esm/index.js',
    '@ffmpeg/core': '@ffmpeg/core/dist/esm/ffmpeg-core.js'
};

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f);
        const isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function getRelativePathToNodeModules(filePath) {
    // Get directory of the file
    const fileDir = path.dirname(filePath);
    // Calculate relative path from fileDir to DIST root
    const relToDist = path.relative(fileDir, DIST);
    // Join with node_modules
    return path.join(relToDist, NODE_MODULES).replace(/\\/g, '/');
}

console.log(`Replacing bare imports with relative paths in: ${DIST}`);

if (!fs.existsSync(DIST)) {
    console.error(`Dist directory not found: ${DIST}`);
    process.exit(1);
}

walkDir(DIST, (filePath) => {
    if (!filePath.endsWith('.js')) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Calculate relative path to node_modules for this file
    const relNodeModules = getRelativePathToNodeModules(filePath);

    for (const [moduleName, modulePath] of Object.entries(IMPORT_MAP)) {
        // Regex to match: import ... from 'moduleName'; or import 'moduleName';
        // and export ... from 'moduleName';
        // Escape special chars in moduleName (like @ and /)
        const escapedModuleName = moduleName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

        const regex = new RegExp(`(import|export)\\s+([^"']*(?:from\\s+)?)(["'])(${escapedModuleName})(["'])`, 'g');

        if (regex.test(content)) {
            const targetPath = `${relNodeModules}/${modulePath}`.replace(/\\/g, '/');

            content = content.replace(regex, (match, p1, p2, p3, p4, p5) => {
                // Ensure dot-slash for relative paths if not present
                let finalPath = targetPath;
                if (!finalPath.startsWith('.')) {
                    finalPath = './' + finalPath;
                }
                return `${p1} ${p2}${p3}${finalPath}${p5}`;
            });
            changed = true;
        }
    }

    if (changed) {
        console.log(`Replaced imports in: ${filePath}`);
        fs.writeFileSync(filePath, content);
    }
});

console.log('Done!');
