/**
 * The base class of every downloader.
 */
export abstract class Downloader {
    private static mutationObserver: MutationObserver | null = null;
    private static observerTimeout: any = null;
    private static instances: Downloader[] = [];

    /**
     * Handle DOM mutations
     */
    private static handleMutation(mutations: MutationRecord[]): void {
        // Ignore mutations from our own button insertions
        const isOurMutation = mutations.some(mutation => {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement) {
                    // Skip if we added a download button or alert
                    if (node.classList?.contains('post-download-button') ||
                        node.classList?.contains('alert') ||
                        node.classList?.contains('alert-wrapper')) {
                        return true;
                    }
                    // Skip if the added node contains our button
                    if (node.querySelector?.('.post-download-button, .alert, .alert-wrapper')) {
                        return true;
                    }
                }
            }
            return false;
        });

        if (isOurMutation) {
            return; // Ignore our own changes
        }

        if (Downloader.observerTimeout) {
            clearTimeout(Downloader.observerTimeout);
        }

        Downloader.observerTimeout = setTimeout(() => {
            // console.log('[Downloader] DOM changed, reinitializing instances...');
            // Reinitialize all downloader instances
            Downloader.instances.forEach(instance => {
                instance.reinitialize();
            });
        }, 1000); // Debounce to 1 second
    }

    /**
     * Create a new downloader
     */
    public init(): void {
        // Add this instance to the list
        if (!Downloader.instances.includes(this)) {
            Downloader.instances.push(this);
        }

        // Initialize the observer if not already done
        if (!Downloader.mutationObserver) {
            Downloader.mutationObserver = new MutationObserver(Downloader.handleMutation);
            Downloader.mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
            });
        }

        this.createDownloadButton();
    }



    /**
     * This method has to create a new download button
     */
    protected abstract createDownloadButton(): void;

    /**
     * This method has to remove and initialize the downloader
     */
    protected abstract reinitialize(): void;

    /**
     * Remove the downloader
     */
    protected remove(className: string): void {
        // Remove this instance from the list
        const index = Downloader.instances.indexOf(this);
        if (index > -1) {
            Downloader.instances.splice(index, 1);
        }

        // Remove all added elements if they have not already been removed
        const elements: HTMLElement[] = Array.from(document.querySelectorAll(className)) as HTMLElement[];
        elements.forEach((element: HTMLElement) => {
            try {
                element.remove();
            } catch {
                // Do nothing
            }
        });

        // Disconnect observer if no more instances
        if (Downloader.instances.length === 0 && Downloader.mutationObserver) {
            Downloader.mutationObserver.disconnect();
            Downloader.mutationObserver = null;
        }
    }

    /**
     * Get the account name of a post
     * @param element The post element
     * @param accountClass The class the account has
     */
    protected getAccountName(element: HTMLElement, accountClass: string): string {
        let accountName: string;
        try {
            accountName = (element.querySelector(accountClass) as HTMLElement).innerText;
        } catch {
            accountName = 'no_account_found';
        }

        return accountName;
    }

}
