import browser from 'webextension-polyfill';
import { singleton } from '../decorators';
import { DownloadMessage, DownloadType, FFmpegMergeMessage } from '../models/extension';
import { downloadSingleImage } from './download';
import { ffmpegMerger } from '../helper-classes/FFmpegMerger';
import OnInstalledDetailsType = browser.Runtime.OnInstalledDetailsType;

@singleton
class BackgroundMessageHandler {

    public constructor() {
        browser.runtime.onInstalled.addListener(BackgroundMessageHandler.onUpdate);
        browser.runtime.onMessage.addListener(BackgroundMessageHandler.onMessage);
    }

    private static async onUpdate(reason: OnInstalledDetailsType): Promise<void> {
        if (reason.reason !== 'update') return;
        
        const options = browser.runtime.getURL('options.html');
        await browser.tabs.create({
            url: options,
        });
    }

    private static async onMessage(message: DownloadMessage | FFmpegMergeMessage): Promise<any> {
        if (message.type === DownloadType.single) {
            await downloadSingleImage(message as DownloadMessage);
        } else if (message.type === DownloadType.ffmpegMerge) {
            const ffmpegMsg = message as FFmpegMergeMessage;
            console.log('[Background] Received FFmpeg merge request');

            try {
                // Fetch video and audio blobs
                const videoResponse = await fetch(ffmpegMsg.videoUrl);
                const videoBlob = await videoResponse.blob();
                const audioResponse = await fetch(ffmpegMsg.audioUrl);
                const audioBlob = await audioResponse.blob();

                console.log('[Background] Fetched blobs, starting merge...');

                // Merge using FFmpeg
                const mergedBlob = await ffmpegMerger.mergeVideoAudio(
                    videoBlob,
                    audioBlob,
                    `${ffmpegMsg.outputFileName}.mp4`
                );

                console.log('[Background] Merge complete, creating blob URL...');

                // Create blob URL and return it
                const mergedUrl = URL.createObjectURL(mergedBlob);

                // Download the merged file
                await downloadSingleImage({
                    downloadURL: [mergedUrl],
                    outputFileName: ffmpegMsg.outputFileName,
                    type: DownloadType.single,
                });

                console.log('[Background] Download initiated');

                return { success: true };
            } catch (error) {
                console.error('[Background] FFmpeg merge failed:', error);
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
    }

}

// @ts-ignore
export const messageHandler = new BackgroundMessageHandler();
