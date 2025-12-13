import browser from 'webextension-polyfill';
import { downloadFile } from '../downloaders/download-functions';
import { sleep } from '../functions';
import { DownloadMessage } from '../models/extension';

const IS_FIREFOX = 'browser' in window;

const downloadFailed = async (downloadId: number): Promise<boolean> => {
    const downloadItem = (await browser.downloads.search({id: downloadId})).pop();

    return downloadItem ? !!downloadItem.error : false;
};

const fetchDownload = async (url: string, fileName: string): Promise<number> => {
    const downloadBlob = await downloadFile(url);

    return browser.downloads.download({url: window.URL.createObjectURL(downloadBlob), filename: fileName});
};

const nativeDownload = async (url: string, fileName: string): Promise<number> => {
    // Try without custom headers first - Chrome Manifest V2 may block them
    // The download should work since the request comes from instagram.com context
    return browser.downloads.download({url, filename: fileName});
};

export async function downloadSingleImage(message: DownloadMessage): Promise<void> {
    // Get the file extension from URL
    const urlFileName = getImageId(message.downloadURL[0]);
    let fileExtension = urlFileName.split('.').pop() || 'mp4';

    // Ensure extension is valid (jpg, jpeg, png, mp4, etc)
    if (!fileExtension || fileExtension.length > 5) {
        fileExtension = 'mp4';
    }

    // Use account name directly with extension
    const imageName = `${message.outputFileName}.${fileExtension}`;
    console.log('[downloadSingleImage] Download name:', imageName);
    const downloadURL: string = message.downloadURL[0];

    if (IS_FIREFOX) {
        const downloadId = await fetchDownload(downloadURL, imageName);
        await sleep(2000);

        if (await downloadFailed(downloadId)) {
            console.error('Download did not succeed, trying different method');
            setTimeout(() => nativeDownload(downloadURL, imageName), 100);
        }
    } else {
        const downloadId = await nativeDownload(downloadURL, imageName);
        await sleep(2000);
        if (await downloadFailed(downloadId)) {
            console.error('Download did not succeed, trying different method');
            setTimeout(() => fetchDownload(downloadURL, imageName), 100);
        }
    }
}

/**
 * Gets the image name based on the url of the image
 * @param url the url of the image or video
 * @returns the image/video name
 */
function getImageId(url: string): string {
    return url.split('?')[0]!.split('/').pop()!;
}
