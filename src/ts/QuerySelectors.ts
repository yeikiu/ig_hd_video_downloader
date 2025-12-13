/**
 * A bunch of css selectors which get used by instagram
 */

export enum QuerySelectors {
    // Locale-independent: Target section with share button (paper plane icon has unique SVG path)
    postWrapper = 'section:has(path[d^="M13.973"])',

    // Share button - paper plane icon with distinctive path coordinates (works for timeline, reel, and modal)
    postShare = 'div[role="button"]:has(path[d^="M13.973"]), button:has(path[d^="M13.973"])',

    // Account name - semantic attributes, filters out post/reel links
    postAccountName = 'a[role="link"].notranslate[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]) span[dir="auto"]',
}
