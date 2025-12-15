import { PostDownloader } from './downloaders/PostDownloader.js';

/**
 * Addon manager (Instanciate only once!)
 */
class AddonManager {
    private postDownloader: PostDownloader = new PostDownloader();

    public constructor() {
        console.log(`[AddonManager] Initializing v2.0.0...`);
        this.postDownloader.init();
        console.log(`[AddonManager] Initialization complete`);
    }
}

/**
 * Create a new Addon manager. This class has to be constructed only once!
 */
new AddonManager();
