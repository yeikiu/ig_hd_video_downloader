import browser from 'webextension-polyfill';
import { DownloadType, FFmpegMergeMessage } from '../models/extension.js';
import OnInstalledDetailsType = browser.Runtime.OnInstalledDetailsType;

class BackgroundMessageHandler {

    private static currentProcessingTabId: number | null = null;

    public constructor() {
        // console.log('[BackgroundMessageHandler] Initializing...');
        browser.runtime.onInstalled.addListener(BackgroundMessageHandler.onUpdate);
        browser.runtime.onMessage.addListener(BackgroundMessageHandler.onMessage);
        // console.log('[BackgroundMessageHandler] Event listeners registered');
    }

    private static async onUpdate(reason: OnInstalledDetailsType): Promise<void> {
        if (reason.reason !== 'update') return;

        const options = browser.runtime.getURL('options.html');
        await browser.tabs.create({
            url: options,
        });
    }

    private static async ensureOffscreenDocument(): Promise<void> {
        // Check if offscreen document already exists
        // @ts-ignore - chrome.runtime.getContexts is not in webextension-polyfill yet
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
        });

        if (existingContexts.length > 0) {
            // console.log('[Background] Offscreen document already exists');
            return;
        }

        // Create offscreen document
        // console.log('[Background] Creating offscreen document...');
        // @ts-ignore - chrome.offscreen is not in webextension-polyfill yet
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['WORKERS'],
            justification: 'FFmpeg.wasm requires Web Workers for video/audio merging',
        });
        // console.log('[Background] Offscreen document created');
    }

    private static async onMessage(message: any, sender: browser.Runtime.MessageSender): Promise<any> {
        // console.log('[Background] Received message:', message.type);

        // Ignore messages meant for offscreen document - return undefined to let offscreen handle it
        if (message.type === 'FFMPEG_MERGE') {
            return undefined;
        }

        // Handle progress from offscreen
        if (message.type === 'FFMPEG_PROGRESS') {
            if (BackgroundMessageHandler.currentProcessingTabId) {
                // Forward to content script
                try {
                    await browser.tabs.sendMessage(BackgroundMessageHandler.currentProcessingTabId, {
                        type: DownloadType.ffmpegProgress,
                        progress: message.progress
                    });
                } catch (e) {
                    // Tab might be closed
                    console.error('Failed to send progress to tab:', e);
                }
            }
            return;
        }

        if (message.type === DownloadType.ffmpegMerge) {
            // Store the tab ID that requested the merge
            if (sender.tab && sender.tab.id) {
                BackgroundMessageHandler.currentProcessingTabId = sender.tab.id;
            }

            const ffmpegMsg = message as FFmpegMergeMessage;
            /* console.log('[Background] Received FFmpeg merge request:', {
                videoUrl: ffmpegMsg.videoUrl?.substring(0, 100),
                audioUrl: ffmpegMsg.audioUrl?.substring(0, 100),
            }); */

            try {
                // Create offscreen document if needed
                await BackgroundMessageHandler.ensureOffscreenDocument();

                // Send merge request to offscreen document
                // console.log('[Background] Sending to offscreen document...');
                const result = await browser.runtime.sendMessage({
                    type: 'FFMPEG_MERGE',
                    videoUrl: ffmpegMsg.videoUrl,
                    audioUrl: ffmpegMsg.audioUrl,
                    outputFileName: ffmpegMsg.outputFileName,
                    whatsappMode: ffmpegMsg.whatsappMode
                }) as { success: boolean; blobUrl?: string; error?: string } | undefined;

                if (!result || !result.success) {
                    throw new Error(result?.error || 'Merge failed');
                }

                // console.log('[Background] Merge complete, downloading from blob URL...');

                // Download using the blob URL from offscreen document
                await browser.downloads.download({
                    url: result.blobUrl!,
                    filename: `${ffmpegMsg.outputFileName}.mp4`,
                    saveAs: false
                });

                // console.log('[Background] Download initiated successfully');
                BackgroundMessageHandler.currentProcessingTabId = null;

                return { success: true };
            } catch (error) {
                console.error('[Background] FFmpeg merge failed:', error);
                console.error('[Background] Error stack:', error instanceof Error ? error.stack : 'N/A');
                BackgroundMessageHandler.currentProcessingTabId = null;
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
    }

}

// Initialize the background message handler
// console.log('[Background] Service worker starting...');
// @ts-ignore
export const messageHandler = new BackgroundMessageHandler();
// console.log('[Background] Service worker initialized successfully');
