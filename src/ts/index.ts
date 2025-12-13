import { singleton } from './decorators';
import { PostDownloader } from './downloaders/PostDownloader';
import pkg from '../../package.json';

/**
 * Addon manager (Instanciate only once!)
 */
@singleton
class AddonManager {
    private postDownloader: PostDownloader = new PostDownloader();

    public constructor() {
        this.postDownloader.init();
        console.log(`[PostDownloader]: AddonManager created successfully! v${pkg.version}`);
    }
}

/**
 * Create a new Addon manager. This class has to be constructed only once!
 */
new AddonManager();
