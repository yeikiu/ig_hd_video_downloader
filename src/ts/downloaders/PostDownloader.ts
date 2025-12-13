import browser from 'webextension-polyfill';
import { Alert } from '../components/Alert';
import { DownloadType, FFmpegMergeMessage } from '../models/extension';
import { QuerySelectors } from '../QuerySelectors';
import { Downloader } from './Downloader';


/**
 * A downloader which can be used for instagram posts
 */
export class PostDownloader extends Downloader {

    private creationTimeoutList: number[] = [];
    private removed = true;
    private autoDownloadTriggered = false;

    private static async downloadVideoWithMerge(video: HTMLVideoElement, element: HTMLElement): Promise<void> {
        try {
            // Get video duration from the playing video element
            const videoDuration = video.duration;
            console.log('[PostDownloader] Video duration:', videoDuration);

            // Try to extract a unique post identifier from the video's article
            const videoArticle = video.closest('article');
            const postId = PostDownloader.extractPostIdFromArticle(videoArticle);
            console.log('[PostDownloader] Post ID from video article:', postId);

            if (!postId) {
                Alert.createAndAdd('Could not find post ID', 'warn');
                return;
            }

            // Strategy 1: Try to find video data in page scripts (detail pages after full navigation)
            let pageData = PostDownloader.extractVideoDataFromArticle(videoArticle, videoDuration, postId);
            if (pageData) {
                console.log('[PostDownloader] Found URLs from page scripts');
            }

            // Strategy 2.5: If on detail page and data not found, wait and retry
            // Instagram may still be loading the DASH manifest data (especially on SPA navigation)
            if (!pageData) {
                const isDetailPage = window.location.pathname.match(/\/(p|reel)\/[^/]+/);
                if (isDetailPage) {
                    console.log('[PostDownloader] Detail page - waiting for Instagram to load DASH manifest data...');
                    console.log('[PostDownloader] Looking for post ID:', postId);

                    // Try up to 10 times with shorter delays (total 20 seconds)
                    // SPA navigation may take longer to populate script tags
                    for (let attempt = 1; attempt <= 10 && !pageData; attempt++) {
                        const delay = attempt <= 5 ? attempt * 1000 : 2000; // 1s, 2s, 3s, 4s, 5s, then 2s each
                        await new Promise(resolve => setTimeout(resolve, delay));
                        console.log(`[PostDownloader] Retry attempt ${attempt}/10 after ${delay}ms...`);

                        // Check page scripts for DASH manifest
                        pageData = PostDownloader.extractVideoDataFromArticle(videoArticle, videoDuration, postId);
                        if (pageData) {
                            console.log(`[PostDownloader] ✓ Found URLs in page scripts after ${attempt} retry attempts`);
                            break;
                        }
                    }

                    if (!pageData) {
                        console.log('[PostDownloader] No data found after 10 retries (20 seconds)');
                    }
                }
            }

            // Strategy 3 removed: Modal clicking doesn't populate script tags in Instagram's current architecture
            // Strategy 4 removed: MediaSourceTracker - focusing on page scripts only

            // If still not found after all strategies
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
            console.log({postAccountName})

            postAccountName = postAccountName || 'unknown';
            console.log('[PostDownloader] Account name:', postAccountName);
            console.log('[PostDownloader] Account article:', article);

            // Show info alert to user
            const processingAlert = await Alert.createAndAdd('Processing video with FFmpeg...', 'default', false, null);

            // Send FFmpeg merge request to background script
            const message: FFmpegMergeMessage = {
                type: DownloadType.ffmpegMerge,
                videoUrl,
                audioUrl,
                accountName: postAccountName,
                videoDuration: videoDuration,
                outputFileName: `${postAccountName}_${Math.floor(videoDuration)}`
            };

            const result = await browser.runtime.sendMessage(message) as { success?: boolean; error?: string };

            // Remove processing alert
            await Alert.remove(processingAlert);

            if (!result?.success) {
                Alert.createAndAdd(`Merge failed: ${result?.error || 'Unknown error'}`, 'warn');
            } else {
                Alert.createAndAdd('Video download started!', 'default', true, 3000);
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

    private static extractPostIdFromArticle(article: HTMLElement | null): string | null {
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

    private static extractVideoDataFromArticle(
        article: HTMLElement | null,
        targetDuration: number,
        postId: string | null
    ): { videoUrl: string; audioUrl?: string } | null {
        if (!article) {
            console.log('[PostDownloader] No article element provided - searching entire page (detail/reel page)');
        }

        console.log('[PostDownloader] Searching for video data in page scripts for postId:', postId, 'duration:', targetDuration);

        // Search all script tags in the document for matching video data
        const allScripts = document.querySelectorAll('script');
        console.log('[PostDownloader] Searching through', allScripts.length, 'script tags in document');

        const matches: Array<{
            urls: { videoUrl: string; audioUrl?: string };
            score: number;
            matchType: string;
        }> = [];

        for (const script of allScripts) {
            const content = script.textContent || '';
            if (!content.includes('video_dash_manifest')) continue;

            try {
                const data = JSON.parse(content);
                const result = PostDownloader.findMatchingDashManifestWithScore(data, targetDuration, postId);
                if (result) {
                    matches.push(result);
                }
            } catch (e) {
                // Not valid JSON
            }
        }

        if (matches.length === 0) {
            console.log('[PostDownloader] No matching video data found in page scripts');
            return null;
        }

        // Sort by score (highest first)
        matches.sort((a, b) => b.score - a.score);

        console.log('[PostDownloader] Found', matches.length, 'matches in page scripts, best:', matches[0].matchType, 'score:', matches[0].score);
        return matches[0].urls;
    }

    private static findMatchingDashManifestWithScore(
        obj: any,
        targetDuration: number,
        postId: string | null = null,
        depth = 0
    ): { urls: { videoUrl: string; audioUrl?: string }; score: number; matchType: string } | null {
        // Prevent infinite recursion
        if (depth > 30 || !obj || typeof obj !== 'object') {
            return null;
        }

        let bestMatch: { urls: { videoUrl: string; audioUrl?: string }; score: number; matchType: string } | null = null;

        // Check if this object has a video_dash_manifest field
        if (obj.video_dash_manifest && typeof obj.video_dash_manifest === 'string') {
            const manifest = obj.video_dash_manifest;

            // Parse DASH manifest duration (format: PT43.945332S)
            const durationMatch = manifest.match(/mediaPresentationDuration="PT([\d.]+)S"/);
            if (durationMatch) {
                const duration = parseFloat(durationMatch[1]);
                const durationDiff = Math.abs(duration - targetDuration);

                // Check if this object has the postId we're looking for
                const objStr = JSON.stringify(obj);
                const hasExactPostId = postId && (
                    objStr.includes(`"shortcode":"${postId}"`) ||
                    objStr.includes(`"code":"${postId}"`) ||
                    objStr.includes(`"pk":"${postId}"`)
                );

                // If we have an exact postId match, accept it regardless of duration
                // OR if duration matches within tolerance
                if (hasExactPostId || durationDiff < 0.1) {
                    // Extract video and audio URLs from DASH manifest
                    const urls = PostDownloader.parseDashManifest(manifest);
                    if (urls) {
                        // Calculate match score based on available identifiers
                        let score = 0;
                        let matchType = '';

                        // Best match: has the exact postId
                        if (hasExactPostId) {
                            score = 100;
                            matchType = durationDiff < 0.1 ? 'exact_postId_and_duration' : 'exact_postId_only';
                            console.log('[PostDownloader] Found exact postId match:', postId, 'with duration diff:', durationDiff.toFixed(2));
                        }
                        // Good match: postId appears somewhere in the object (less specific)
                        else if (postId && objStr.includes(postId)) {
                            score = 75;
                            matchType = 'postId_mentioned_and_duration';
                        }
                        // Fallback: only duration match
                        else {
                            score = 50;
                            matchType = 'duration_only';

                            // Log what IDs this object has for debugging
                            if (depth === 0) {
                                const idMatch = objStr.match(/"(?:shortcode|code|id|pk)"\s*:\s*"([^"]+)"/);
                                if (idMatch) {
                                    console.log('[PostDownloader] Duration match found but with different ID:', idMatch[1], '(looking for:', postId, ')');
                                }
                            }
                        }

                        // Adjust score based on duration precision (closer = better)
                        // But don't penalize too much if we have exact postId match
                        if (hasExactPostId) {
                            score -= Math.min(durationDiff * 0.1, 1); // Small penalty for duration mismatch with exact ID
                        } else {
                            score -= durationDiff * 10; // Larger penalty for duration-only matches
                        }

                        if (!bestMatch || score > bestMatch.score) {
                            bestMatch = { urls, score, matchType };
                        }
                    }
                }
            }
        }

        // Recursively search nested objects and arrays
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const result = PostDownloader.findMatchingDashManifestWithScore(item, targetDuration, postId, depth + 1);
                if (result && (!bestMatch || result.score > bestMatch.score)) {
                    bestMatch = result;
                }
            }
        } else {
            for (const key in obj) {
                const result = PostDownloader.findMatchingDashManifestWithScore(obj[key], targetDuration, postId, depth + 1);
                if (result && (!bestMatch || result.score > bestMatch.score)) {
                    bestMatch = result;
                }
            }
        }

        return bestMatch;
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
            const postId = PostDownloader.extractPostIdFromArticle(element.closest('article'));
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
                video = videoElements[Number(imgIndex)-1];
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
        let postList: HTMLElement[] = [...document.querySelectorAll(QuerySelectors.postWrapper)] as HTMLElement[];

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
        this.remove();
        this.init();
    }

    public init(): void {
        this.removed = false;
        super.init();

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
        // Check if button already exists to prevent duplicates
        const existingButton = element.querySelector('.post-download-button');
        if (existingButton) {
            return;
        }

        // Always show button (images download directly, videos navigate to detail page)
        if (!this.canDownloadVideo(element)) {
            return;
        }

        // Always search for share button and insert before it
        const shareElement: HTMLElement = element.querySelector(QuerySelectors.postShare) as HTMLElement;
        if (!shareElement) {
            return;
        }

        // Clone the share button structure to match Instagram's style exactly
        const downloadButton = shareElement.cloneNode(true) as HTMLElement;
        downloadButton.classList.add('post-download-button');
        downloadButton.onclick = () => PostDownloader.handleDownloadButtonClick(element);

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
