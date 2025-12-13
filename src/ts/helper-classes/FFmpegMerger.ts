import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import browser from 'webextension-polyfill';

/**
 * FFmpeg wrapper for merging audio and video streams
 */
export class FFmpegMerger {
    private ffmpeg: FFmpeg;
    private loaded: boolean = false;

    constructor() {
        this.ffmpeg = new FFmpeg();

        // Enable logging to debug merge issues
        this.ffmpeg.on('log', ({ message }) => {
            console.log('[FFmpeg]', message);
        });
    }

    /**
     * Load FFmpeg core (call once on initialization)
     * Loads WASM files from local extension directory (not CDN)
     */
    public async load(): Promise<void> {
        if (this.loaded) return;

        console.log('[FFmpegMerger] Loading FFmpeg from local files...');

        try {
            // Load from local lib directory (bundled with extension)
            // @ts-ignore - browser is provided by webextension-polyfill
            const coreURL = browser.runtime.getURL('lib/ffmpeg-core.js');
            // @ts-ignore - browser is provided by webextension-polyfill
            const wasmURL = browser.runtime.getURL('lib/ffmpeg-core.wasm');
            // @ts-ignore - browser is provided by webextension-polyfill
            const workerURL = browser.runtime.getURL('js/node_modules_ffmpeg_ffmpeg_dist_esm_worker_js.js');

            console.log('[FFmpegMerger] Core URL:', coreURL);
            console.log('[FFmpegMerger] WASM URL:', wasmURL);
            console.log('[FFmpegMerger] Worker URL:', workerURL);

            await this.ffmpeg.load({
                coreURL,
                wasmURL,
                workerURL,
            });

            this.loaded = true;
            console.log('[FFmpegMerger] FFmpeg loaded successfully from local files');
        } catch (error) {
            console.error('[FFmpegMerger] Failed to load FFmpeg:', error);
            console.error('[FFmpegMerger] Error details:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            throw error;
        }
    }

    /**
     * Merge video and audio blobs into single MP4
     * @param videoBlob - Video stream blob
     * @param audioBlob - Audio stream blob
     * @param outputName - Output filename (e.g., 'danienverso_24.mp4')
     * @returns Merged video blob
     */
    public async mergeVideoAudio(
        videoBlob: Blob,
        audioBlob: Blob,
        outputName: string,
    ): Promise<Blob> {
        if (!this.loaded) {
            await this.load();
        }

        console.log('[FFmpegMerger] Starting merge:', outputName);
        console.log('[FFmpegMerger] Video blob size:', videoBlob.size, 'bytes');
        console.log('[FFmpegMerger] Audio blob size:', audioBlob.size, 'bytes');

        try {
            // Write input files to FFmpeg virtual filesystem
            await this.ffmpeg.writeFile('video.mp4', await fetchFile(videoBlob));
            await this.ffmpeg.writeFile('audio.mp4', await fetchFile(audioBlob));

            console.log('[FFmpegMerger] Files written to virtual filesystem');

            // Run FFmpeg command to merge audio and video
            // Use '?' suffix to make audio stream optional (handles video-only files)
            // -i video.mp4: input video
            // -i audio.mp4: input audio (may contain video only)
            // -map 0:v:0: map video stream from first input
            // -map 1:a:0?: map audio stream from second input (optional - '?' means don't fail if missing)
            // -c:v copy: copy video codec (no re-encoding, fast)
            // -c:a copy: copy audio codec (faster, no re-encoding)
            // -shortest: finish encoding when shortest input stream ends
            await this.ffmpeg.exec([
                '-i', 'video.mp4',
                '-i', 'audio.mp4',
                '-map', '0:v:0',
                '-map', '1:a:0?',  // '?' makes audio optional - if not present, just copy video
                '-c:v', 'copy',
                '-c:a', 'copy',
                '-shortest',
                'output.mp4',
            ]);

            console.log('[FFmpegMerger] FFmpeg exec completed');

            // Read merged file from virtual filesystem
            const data = await this.ffmpeg.readFile('output.mp4');

            console.log('[FFmpegMerger] Output file size:', data.length, 'bytes');

            // Clean up virtual filesystem
            await this.ffmpeg.deleteFile('video.mp4');
            await this.ffmpeg.deleteFile('audio.mp4');
            await this.ffmpeg.deleteFile('output.mp4');

            console.log('[FFmpegMerger] Merge complete, virtual filesystem cleaned up');

            // Convert FileData to Blob
            // @ts-ignore - FFmpeg FileData type handling
            return new Blob([data], { type: 'video/mp4' });
        } catch (error) {
            console.error('[FFmpegMerger] Error during merge:', error);
            throw error;
        }
    }
}

// Singleton instance
export const ffmpegMerger = new FFmpegMerger();
