const fs = require('fs');
const fsPromises = require('fs/promises');
const { execSync } = require('child_process');

async function copyDirectory(src, dest) {
    await fsPromises.mkdir(dest, { recursive: true });
    const entries = await fsPromises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = `${src}/${entry.name}`;
        const destPath = `${dest}/${entry.name}`;

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fsPromises.copyFile(srcPath, destPath);
        }
    }
}

class BuildExtensionPlugin {

    constructor() {
        this.production = false;
    }


    apply(compiler) {
        compiler.hooks.done.tap('BuildExtensionPlugin', async (params) => {
            this.production = params.compilation.options.mode === "production";
            await this.build();
        });
    }

    async build() {

        // Check if dir exists and create it otherwise
        await fsPromises.mkdir('zip', { recursive: true });

        // Generate the extension for every browser
        for (const browser of ["chrome", "firefox"]) {
            await this.assembleExtensionFiles(browser);
            try {
                await this.createZip(browser);
            } catch (e) {
                console.warn(`Could not create zip file for ${browser}:`, e.message);
            }

            if (this.production) {
                console.log(`Linting ${browser}`);
                console.log(
                    await this.execute(`addons-linter zip/${browser}.zip`),
                );
            }
        }

        if (this.production) {
            await this.execute("git archive --format zip --output zip/InstagramDownloader.zip HEAD");
        }
    };

    /**
     * Create a zip file using platform-specific commands
     * @param browser The browser (chrome or firefox)
     */
    async createZip(browser) {
        const isWindows = process.platform === 'win32';
        const sourceDir = `zip/${browser}`;
        const outputZip = `zip/${browser}.zip`;

        // Remove old zip if exists
        try {
            await fsPromises.unlink(outputZip);
        } catch (e) {
            // File doesn't exist, ignore
        }

        if (isWindows) {
            // Use PowerShell Compress-Archive on Windows
            const psCommand = `powershell -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${outputZip}' -Force"`;
            await this.execute(psCommand);
        } else {
            // Use zip command on Mac/Linux
            await this.execute(`cd ${sourceDir} && zip -r ../${browser}.zip * && cd ../..`);
        }
    }

    /**
     * Collect all files necessary to build the extension
     * @param browser The browser
     */
    async assembleExtensionFiles(browser) {
        const path = `zip/${browser}`;
        await fsPromises.rm(path, { recursive: true, force: true });
        await fsPromises.mkdir(path, { recursive: true });

        await fsPromises.copyFile(`src/manifest_${browser}.json`, `${path}/manifest.json`);
        await copyDirectory("src/icons", `${path}/icons`);
        await copyDirectory("dist", path);

        // Copy FFmpeg WASM files for local loading (browser extensions can't use CDN)
        await fsPromises.mkdir(`${path}/lib`, { recursive: true });
        await fsPromises.copyFile('node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js', `${path}/lib/ffmpeg-core.js`);
        await fsPromises.copyFile('node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm', `${path}/lib/ffmpeg-core.wasm`);
        console.log(`FFmpeg WASM files copied for ${browser}`);
    }


    /**
     * Execute a command in the linux command line
     * @param command The command which should be executed
     */
    execute(command) {
        let response = "";
        try {
            response = execSync(command, {encoding: "utf-8"});
        } catch (e) {
            console.error(e);
        }
        return response;
    }
}


module.exports = BuildExtensionPlugin;
