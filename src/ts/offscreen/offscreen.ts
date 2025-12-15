import browser from 'webextension-polyfill';
import { ffmpegMerger } from '../helper-classes/FFmpegMerger.js';

console.log('[Offscreen] Offscreen document loaded');

// Listen for messages from background script
// Handle FFmpeg merge requests
const handleMessage = async (message: any): Promise<any> => {
    try {
        console.log('[Offscreen] Starting FFmpeg merge...');

        // Fetch video and audio blobs
        const videoResponse = await fetch(message.videoUrl);
        const videoBlob = await videoResponse.blob();

        const audioResponse = await fetch(message.audioUrl);
        const audioBlob = await audioResponse.blob();

        console.log('[Offscreen] Blobs fetched, merging...');

        // Merge using FFmpeg
        const mergedBlob = await ffmpegMerger.mergeVideoAudio(
            videoBlob,
            audioBlob,
            `${message.outputFileName}.mp4`
        );

        console.log('[Offscreen] Merge complete, creating blob URL...');

        // Create blob URL and send back to background
        // We can't use downloads API in offscreen, must send URL to background
        const url = URL.createObjectURL(mergedBlob);

        console.log('[Offscreen] Blob URL created:', url);

        return {
            success: true,
            blobUrl: url
        };
    } catch (error) {
        console.error('[Offscreen] FFmpeg merge failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
};

// Listen for messages from background script
// IMPORTANT: This listener must be synchronous ensuring we only return a Promise 
// if we actually handle the message. Otherwise we block other listeners (race condition).
browser.runtime.onMessage.addListener((message: any) => {
    console.log('[Offscreen] Received message:', message.type);

    if (message.type === 'FFMPEG_MERGE') {
        return handleMessage(message);
    }
    // Return undefined to let other listeners handle the message
    return undefined;
});
