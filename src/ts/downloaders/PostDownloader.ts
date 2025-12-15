import browser from 'webextension-polyfill';
import { Alert } from '../components/Alert.js';
import { DownloadType, FFmpegMergeMessage } from '../models/extension.js';
import { QuerySelectors } from '../QuerySelectors.js';
import { Downloader } from './Downloader.js';


/**
 * A downloader which can be used for instagram posts
 */
export class PostDownloader extends Downloader {

    private creationTimeoutList: number[] = [];
    private removed = true;
    private autoDownloadTriggered = false;
    private static navigationInterceptorInstalled = false;
    private static lastFullNavigationUrl = '';

    private static async downloadVideoWithMerge(video: HTMLVideoElement, element: HTMLElement): Promise<void> {
        try {
            // Extract post ID - this is our primary identifier
            const videoArticle = video.closest('article');
            const postId = PostDownloader.extractPostIdFromArticleOrUrl(videoArticle);
            console.log('[PostDownloader] Post ID:', postId);

            if (!postId) {
                Alert.createAndAdd('Could not find post ID', 'warn');
                return;
            }

            // Find video data by postId (no duration fallback)
            let pageData = PostDownloader.extractVideoDataByPostId(postId);
            if (pageData) {
                console.log('[PostDownloader] ✓ Found video data for post:', postId);
            }

            // If not found, show user-friendly message
            if (!pageData) {
                const isDetailPage = window.location.pathname.match(/\/(p|reel)\/[^/]+/);
                if (isDetailPage) {
                    Alert.createAndAdd(
                        `Video data not loaded yet. Please refresh the page (F5) and try again.`,
                        'warn',
                        true,
                        15000
                    );
                } else {
                    Alert.createAndAdd(
                        `To download this video: Click the post to open it, then click the download button on the opened post page.`,
                        'warn',
                        true,
                        15000
                    );
                }
                return;
            }

            const { videoUrl, audioUrl } = pageData;

            if (!videoUrl) {
                Alert.createAndAdd('Could not find video URL', 'warn');
                return;
            }

            console.log('[PostDownloader] Extracted videoUrl:', videoUrl);
            console.log('[PostDownloader] Extracted audioUrl:', audioUrl);

            // Extract account name from section's article element (where the download button is)
            const article = element.closest('article');
            let postAccountName = (article?.querySelector(QuerySelectors.postAccountName) as HTMLElement | null)?.innerText;

            // If no article (detail/reel pages), search in main
            if (!postAccountName) {
                postAccountName = (document.querySelector(`main[role="main"] ${QuerySelectors.postAccountName}`) as HTMLElement | null)?.innerText;
            }
            console.log({ postAccountName })

            postAccountName = postAccountName || 'unknown';
            console.log('[PostDownloader] Account name:', postAccountName);
            console.log('[PostDownloader] Account article:', article);

            // Show info alert to user
            const processingAlert = await Alert.createAndAdd('Processing video with FFmpeg...', 'default', false, null);

            try {
                console.log('[PostDownloader] Sending FFmpeg merge request to background...');
                const outputFileName = `${postAccountName}_${postId}`;

                // Send FFmpeg merge message to background script
                const ffmpegMessage: FFmpegMergeMessage = {
                    type: DownloadType.ffmpegMerge,
                    videoUrl: videoUrl,
                    audioUrl: audioUrl || videoUrl,
                    outputFileName: outputFileName
                };

                const result = await browser.runtime.sendMessage(ffmpegMessage) as { success: boolean; error?: string } | null;

                // Remove processing alert
                await Alert.remove(processingAlert);

                if (result && result.success) {
                    console.log('[PostDownloader] FFmpeg merge completed successfully');
                    Alert.createAndAdd('Video download started!', 'default', true, 3000);
                } else {
                    const errorMessage = result ? result.error : 'No response from background script';
                    console.error('[PostDownloader] FFmpeg merge failed:', errorMessage);
                    // Only alert if we really think it failed. 
                    // If result is null but user says it works, it might be a false negative.
                    // But we should report it.
                    Alert.createAndAdd(`Merge failed: ${errorMessage || 'Unknown error'}`, 'warn');
                }
            } catch (error) {
                // Remove processing alert
                await Alert.remove(processingAlert);
                console.error('[PostDownloader] Error during FFmpeg request:', error);
                Alert.createAndAdd(`Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'warn');
            }
        } catch (error) {
            console.error('[PostDownloader] Error during video merge:', error);
            Alert.createAndAdd('Could not merge video and audio', 'warn');
        }
    }

    /**
     * Extract post ID from current page URL (for detail/reel pages)
     */
    private static extractPostIdFromUrl(): string | null {
        const match = window.location.pathname.match(/\/(p|reel)\/([^/]+)/);
        if (match) {
            console.log('[PostDownloader] Found post ID from URL:', match[2]);
            return match[2];
        }
        console.log('[PostDownloader] No post ID found in URL');
        return null;
    }

    private static extractPostIdFromArticleOrUrl(article: HTMLElement | null): string | null {
        try {
            if (!article) {
                console.log('[PostDownloader] No article element, trying URL extraction');
                // On detail/reel pages without articles, extract from URL
                return PostDownloader.extractPostIdFromUrl();
            }

            // Look for post link - prefer links in metadata area (with time element)
            const timeLinks = article.querySelectorAll('time');
            for (const timeEl of timeLinks) {
                const postLink = timeEl.closest('a') as HTMLAnchorElement;
                if (postLink && postLink.href) {
                    const match = postLink.href.match(/\/(p|reel)\/([^/]+)/);
                    if (match) {
                        console.log('[PostDownloader] Found post ID from time link:', match[2]);
                        return match[2]; // Return the post short code
                    }
                }
            }

            // Fallback: any link with /p/ or /reel/ in the article
            const postLink = article.querySelector('a[href*="/p/"], a[href*="/reel/"]') as HTMLAnchorElement;
            if (postLink) {
                const match = postLink.href.match(/\/(p|reel)\/([^/]+)/);
                if (match) {
                    console.log('[PostDownloader] Found post ID from article link:', match[2]);
                    return match[2]; // Return the post short code
                }
            }

            console.log('[PostDownloader] No post ID found in article, trying URL');
            // Last resort: try URL extraction
            return PostDownloader.extractPostIdFromUrl();
        } catch (error) {
            console.error('[PostDownloader] Error extracting post ID:', error);
            return null;
        }
    }

    /**
     * Extract video data from page scripts using postId ONLY
     * No duration fallback - direct postId matching for reliability
     */
    private static extractVideoDataByPostId(postId: string): { videoUrl: string; audioUrl?: string } | null {
        console.log('[PostDownloader] Searching for DASH manifest with postId:', postId);

        // Search all script tags for matching video data
        const allScripts = document.querySelectorAll('script');
        console.log('[PostDownloader] Scanning', allScripts.length, 'script tags');

        for (const script of allScripts) {
            const content = script.textContent || '';
            if (!content.includes('video_dash_manifest')) continue;

            try {
                const data = JSON.parse(content);
                const result = PostDownloader.findDashManifestByPostId(data, postId);
                if (result) {
                    console.log('[PostDownloader] ✓ Found exact match for postId:', postId);
                    return result;
                }
            } catch (e) {
                // Not valid JSON, skip
            }
        }

        console.log('[PostDownloader] No DASH manifest found for postId:', postId);
        return null;
    }

    /**
     * Recursively search for DASH manifest matching the postId
     * Returns first exact match found
     */
    private static findDashManifestByPostId(
        obj: any,
        postId: string,
        depth = 0
    ): { videoUrl: string; audioUrl?: string } | null {
        // Prevent infinite recursion
        if (depth > 30 || !obj || typeof obj !== 'object') {
            return null;
        }

        // Check if this object has video_dash_manifest
        if (obj.video_dash_manifest && typeof obj.video_dash_manifest === 'string') {
            // Check if this object matches our postId
            const objStr = JSON.stringify(obj);
            const hasExactPostId =
                objStr.includes(`"shortcode":"${postId}"`) ||
                objStr.includes(`"code":"${postId}"`) ||
                objStr.includes(`"pk":"${postId}"`);

            if (hasExactPostId) {
                // Found exact match - parse and return
                const urls = PostDownloader.parseDashManifest(obj.video_dash_manifest);
                if (urls) {
                    return urls;
                }
            }
        }

        // Recursively search nested objects and arrays
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const result = PostDownloader.findDashManifestByPostId(item, postId, depth + 1);
                if (result) return result;
            }
        } else {
            for (const key in obj) {
                const result = PostDownloader.findDashManifestByPostId(obj[key], postId, depth + 1);
                if (result) return result;
            }
        }

        return null;
    }

    private static parseDashManifest(manifest: string): { videoUrl: string; audioUrl?: string } | null {
        try {
            // Parse the DASH manifest to find the highest quality video and audio
            let bestVideoUrl: string | undefined;
            let bestVideoBandwidth = 0;
            let bestAudioUrl: string | undefined;
            let bestAudioBandwidth = 0;

            // Find all AdaptationSet elements
            const adaptationSetMatches = manifest.matchAll(/<AdaptationSet[^>]*>([\s\S]*?)<\/AdaptationSet>/g);

            for (const adaptationMatch of adaptationSetMatches) {
                const adaptationSet = adaptationMatch[1];
                const fullAdaptationSet = adaptationMatch[0]; // Include opening tag for contentType check

                // Check if this is a video or audio adaptation set
                // Check both the content and the AdaptationSet attributes
                const isVideo = adaptationSet.includes('video/') ||
                    adaptationSet.includes('codecs="vp') ||
                    adaptationSet.includes('codecs="avc') ||
                    adaptationSet.includes('codecs="hev') || // HEVC/H.265
                    fullAdaptationSet.includes('contentType="video"') ||
                    fullAdaptationSet.includes('mimeType="video/');

                const isAudio = adaptationSet.includes('audio/') ||
                    adaptationSet.includes('codecs="opus"') ||
                    adaptationSet.includes('codecs="mp4a') ||
                    adaptationSet.includes('codecs="aac') ||
                    fullAdaptationSet.includes('contentType="audio"') ||
                    fullAdaptationSet.includes('mimeType="audio/');

                if (isVideo || isAudio) {
                    // Find all Representation elements within this AdaptationSet
                    const representationMatches = adaptationSet.matchAll(/<Representation[^>]*bandwidth="(\d+)"[^>]*>([\s\S]*?)<\/Representation>/g);

                    for (const repMatch of representationMatches) {
                        const bandwidth = parseInt(repMatch[1], 10);
                        const representation = repMatch[2];

                        // Extract BaseURL from this representation
                        const baseUrlMatch = representation.match(/<BaseURL>([^<]+)<\/BaseURL>/);
                        if (baseUrlMatch) {
                            // Decode HTML entities
                            const decodedUrl = baseUrlMatch[1]
                                .replace(/&amp;/g, '&')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/&quot;/g, '"')
                                .replace(/&#39;/g, "'");

                            // Keep the highest bandwidth (best quality)
                            if (isVideo && bandwidth > bestVideoBandwidth) {
                                bestVideoUrl = decodedUrl;
                                bestVideoBandwidth = bandwidth;
                            } else if (isAudio && bandwidth > bestAudioBandwidth) {
                                bestAudioUrl = decodedUrl;
                                bestAudioBandwidth = bandwidth;
                            }
                        }
                    }
                }
            }

            if (!bestVideoUrl) {
                console.log('[PostDownloader] No video URL found in DASH manifest');
                return null;
            }

            // Convert bandwidth to Mbps for readability
            const videoQualityMbps = (bestVideoBandwidth / 1_000_000).toFixed(2);
            const audioQualityKbps = bestAudioBandwidth > 0 ? (bestAudioBandwidth / 1000).toFixed(0) : 'N/A';

            console.log(`[PostDownloader] ✓ Selected HIGHEST quality - Video: ${videoQualityMbps} Mbps (${bestVideoBandwidth} bps), Audio: ${audioQualityKbps} kbps`);

            return { videoUrl: bestVideoUrl, audioUrl: bestAudioUrl };
        } catch (error) {
            console.error('[PostDownloader] Error parsing DASH manifest:', error);
            return null;
        }
    }

    private static async handleDownloadButtonClick(element: HTMLElement): Promise<void> {
        // Check if we're on timeline, modal, or detail page
        const isDetailPage = window.location.pathname.match(/\/(p|reel)\/[^/]+/);
        const isModal = document.querySelector('div[role="dialog"]') !== null;

        // If we're on timeline OR in a modal, open new tab
        if (!isDetailPage || isModal) {
            const postId = PostDownloader.extractPostIdFromArticleOrUrl(element.closest('article'));
            if (postId) {
                const context = isModal ? 'Modal' : 'Timeline';
                console.log(`[PostDownloader] ${context} detected - opening detail page in new tab:`, postId);
                window.open(`https://www.instagram.com/p/${postId}/?igdl=1`, '_blank');
                return;
            } else {
                Alert.createAndAdd('Could not find post ID to navigate', 'warn');
                return;
            }
        }

        // We're on detail page - find video and download
        // Check for ?img_index parameter
        const urlParams = new URLSearchParams(window.location.search);
        const imgIndex: string | null = urlParams.get('img_index') ?? null;
        const videoElements = Array.from<HTMLVideoElement>(document.querySelectorAll('main[role="main"] video'));

        console.log({ imgIndex, length: videoElements.length });

        let video: HTMLVideoElement | undefined = undefined;

        // Not a carousel
        if (imgIndex === null) {
            video = videoElements[0];
        } else {
            if (videoElements.length < 3) {
                video = videoElements[Number(imgIndex) - 1];
            } else {
                video = videoElements[1];
            }
        }

        if (!video) {
            Alert.createAndAdd('Could not find video', 'warn');
            return;
        }
        console.log('[PostDownloader] Video found:', video?.tagName);

        // Extract and merge with FFmpeg
        await PostDownloader.downloadVideoWithMerge(video, element);
    }

    /**
     * Create a new download button
     */
    public async createDownloadButton(): Promise<void> {
        console.log('[PostDownloader] createDownloadButton called');
        let postList: HTMLElement[] = [...document.querySelectorAll(QuerySelectors.postWrapper)] as HTMLElement[];
        console.log('[PostDownloader] Found post wrappers:', postList.length);

        // Sometimes the button gets added at the moment the image gets updated
        // If this is the case the image download button cannot be added, so here is a timeout to try it again
        if (postList.length === 0) {
            postList = await this.retryCreateButton();
        }
        this.creationTimeoutList.forEach(t => clearTimeout(t));
        this.creationTimeoutList = [];

        postList.forEach((element: HTMLElement) => {
            this.addDownloadButton(element);
        });
    }

    /**
     * Reinitialize the downloader
     */
    public reinitialize(): void {
        console.log('[PostDownloader] Reinitializing...');
        this.remove();
        this.init();
    }

    /**
     * Install navigation interceptor to force full page loads for posts/reels
     * This ensures DASH manifest data is always loaded properly
     */
    private static installNavigationInterceptor(): void {
        if (PostDownloader.navigationInterceptorInstalled) {
            return;
        }
        PostDownloader.navigationInterceptorInstalled = true;

        console.log('[PostDownloader] Installing SPA navigation interceptor...');

        // Intercept clicks on links to posts/reels
        document.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a[href*="/p/"], a[href*="/reel/"]') as HTMLAnchorElement;

            if (!link) return;

            const href = link.href;

            // Skip if this is a download button click or if we're already on this URL
            if (target.closest('.post-download-button')) return;

            // Check if this is a post/reel URL
            const match = href.match(/\/(p|reel)\/([^/?]+)/);
            if (!match) return;

            // Check if we're already on a detail page for this post
            const currentMatch = window.location.pathname.match(/\/(p|reel)\/([^/?]+)/);
            if (currentMatch && currentMatch[2] === match[2]) {
                // Already on this post's detail page, allow normal behavior
                return;
            }

            // Prevent SPA navigation and force full page load
            e.preventDefault();
            e.stopPropagation();

            const targetUrl = href.includes('?') ? href : href.replace(/\/$/, '');

            // Avoid duplicate navigation
            if (PostDownloader.lastFullNavigationUrl === targetUrl) {
                console.log('[PostDownloader] Skipping duplicate navigation to:', targetUrl);
                return;
            }

            PostDownloader.lastFullNavigationUrl = targetUrl;
            console.log('[PostDownloader] Intercepted SPA navigation, forcing full page load:', targetUrl);

            // Force full page load instead of SPA navigation
            window.location.href = targetUrl;
        }, true); // Use capture phase to intercept before Instagram's handlers

        console.log('[PostDownloader] Navigation interceptor installed');
    }

    public init(): void {
        this.removed = false;
        super.init();

        // Install navigation interceptor (once per page)
        PostDownloader.installNavigationInterceptor();

        // Check if we should auto-download (coming from timeline click)
        this.checkAutoDownload();
    }

    /**
     * Check if URL has auto-download flag and trigger download when ready
     */
    private async checkAutoDownload(): Promise<void> {
        // Prevent multiple triggers
        if (this.autoDownloadTriggered) {
            console.log('[PostDownloader] Auto-download already triggered, skipping');
            return;
        }

        // Check for ?igdl=1 parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('igdl')) {
            return;
        }

        // We're on a detail page opened from timeline - wait for data and auto-download
        const isDetailPage = window.location.pathname.match(/\/(p|reel)\/[^/]+/);
        if (!isDetailPage) {
            return;
        }

        // Mark as triggered immediately to prevent race conditions
        this.autoDownloadTriggered = true;

        console.log('[PostDownloader] Auto-download mode detected - waiting for data...');

        // Remove the ?igdl=1 parameter from URL immediately to prevent re-triggers
        window.history.replaceState({}, '', window.location.pathname);

        // Wait for the download button to appear (means page is ready)
        const maxAttempts = 30; // 30 seconds max
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const downloadButton = document.querySelector('.post-download-button') as HTMLElement;
            if (downloadButton) {
                console.log('[PostDownloader] Download button found - auto-clicking...');
                // Click the download button
                downloadButton.click();
                return;
            }
        }

        console.log('[PostDownloader] Auto-download timeout - button not found after 30 seconds');
    }

    /**
     * Remove the downloader
     */
    public remove(): void {
        this.removed = true;
        super.remove('.post-download-button');
    }

    private async retryCreateButton(maxRetries: number = 20, retries: number = 0): Promise<HTMLElement[]> {
        await new Promise(resolve => {
            this.creationTimeoutList.push(setTimeout(resolve, 100) as unknown as number);
        });
        let postList = [...document.querySelectorAll(QuerySelectors.postWrapper)] as HTMLElement[];
        console.log(['with timeout', postList]);

        if (postList.length === 0 || maxRetries <= retries) {
            if (!this.removed) {
                postList = await this.retryCreateButton(maxRetries, retries + 1);
            }
        }

        return postList;
    }

    /**
     * Check if we should show the download button
     * Always show button - we'll handle navigation to detail page for videos
     */
    private canDownloadVideo(_element: HTMLElement): boolean {
        // Only show if element contains a video element
        return ((_element.closest('article')
            ?? _element.closest('main'))?.querySelector('video') ?? null) !== null;
    }

    /**
     * Add the download button to the posts on the page
     * @param element The Post the download button should be added to
     */
    private addDownloadButton(element: HTMLElement): void {
        console.log('[PostDownloader] addDownloadButton called for element');

        // Check if button already exists to prevent duplicates
        const existingButton = element.querySelector('.post-download-button');
        if (existingButton) {
            console.log('[PostDownloader] Button already exists, skipping');
            return;
        }

        // Always show button (images download directly, videos navigate to detail page)
        if (!this.canDownloadVideo(element)) {
            console.log('[PostDownloader] No video found, skipping');
            return;
        }

        // Always search for share button and insert before it
        const shareElement: HTMLElement = element.querySelector(QuerySelectors.postShare) as HTMLElement;
        if (!shareElement) {
            console.log('[PostDownloader] No share element found, skipping');
            return;
        }

        console.log('[PostDownloader] Creating download button...');

        // Clone the share button structure to match Instagram's style exactly
        const downloadButton = shareElement.cloneNode(true) as HTMLElement;
        downloadButton.classList.add('post-download-button');

        // Check if this is a button element (modal) or div (timeline/detail)
        const isButtonElement = downloadButton.tagName === 'BUTTON';

        if (isButtonElement) {
            // Modal case: button has multiple child divs with SVGs for normal and hover states
            // Clear all content and create two divs just like Instagram does
            downloadButton.innerHTML = '';

            const svgContent = `
                <title>Download</title>
                <path d="M12 2.5v11m0 0l-3-3m3 3l3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <path d="M3.5 15.5v3a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            `;

            // First div - normal state (filled icon style)
            const normalDiv = document.createElement('div');
            normalDiv.className = '_abm0 _abm1';
            const normalSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            normalSvg.setAttribute('aria-label', 'Download');
            normalSvg.setAttribute('fill', 'currentColor');
            normalSvg.setAttribute('height', '24');
            normalSvg.setAttribute('width', '24');
            normalSvg.setAttribute('role', 'img');
            normalSvg.setAttribute('viewBox', '0 0 24 24');
            normalSvg.setAttribute('class', 'x1lliihq x1n2onr6 x1roi4f4');
            normalSvg.innerHTML = svgContent;
            normalDiv.appendChild(normalSvg);

            // Second div - hover state (outline icon style)
            const hoverDiv = document.createElement('div');
            hoverDiv.className = '_abm0 _abl_';
            const hoverSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            hoverSvg.setAttribute('aria-label', 'Download');
            hoverSvg.setAttribute('fill', 'currentColor');
            hoverSvg.setAttribute('height', '24');
            hoverSvg.setAttribute('width', '24');
            hoverSvg.setAttribute('role', 'img');
            hoverSvg.setAttribute('viewBox', '0 0 24 24');
            hoverSvg.setAttribute('class', 'x1lliihq x1n2onr6 x5n08af');
            hoverSvg.innerHTML = svgContent;
            hoverDiv.appendChild(hoverSvg);

            downloadButton.appendChild(normalDiv);
            downloadButton.appendChild(hoverDiv);
        } else {
            // Timeline/detail case: div[role="button"] with direct SVG child
            const svg = downloadButton.querySelector('svg');
            if (svg) {
                svg.setAttribute('aria-label', 'Download');
                const title = svg.querySelector('title');
                if (title) title.textContent = 'Download';

                // Replace with download icon path (downward arrow to tray)
                svg.innerHTML = `
                    <title>Download</title>
                    <path d="M12 2.5v11m0 0l-3-3m3 3l3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    <path d="M3.5 15.5v3a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                `;
            }
        }

        // Add our click handler AFTER modifying innerHTML (which would remove event listeners)
        downloadButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[PostDownloader] Download button clicked!', element);
            await PostDownloader.handleDownloadButtonClick(element);
        }, true); // Use capture phase to ensure we catch it first

        console.log('[PostDownloader] Event listener attached to button');

        // Insert before the share button
        // In modals, buttons are wrapped in <span class="x1rg5ohu">, so we need to wrap ours too
        if (isButtonElement && shareElement.parentElement?.tagName === 'SPAN') {
            // Wrap download button in a span like Instagram does
            const wrapperSpan = document.createElement('span');
            wrapperSpan.className = shareElement.parentElement.className;
            wrapperSpan.appendChild(downloadButton);
            shareElement.parentElement.parentElement?.insertBefore(wrapperSpan, shareElement.parentElement);
        } else {
            // Timeline/detail: just insert directly
            shareElement.parentElement?.insertBefore(downloadButton, shareElement);
        }
    }
}
