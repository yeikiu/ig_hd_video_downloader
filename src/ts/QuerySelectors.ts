/**
 * A bunch of css selectors which get used by instagram
 */

export enum QuerySelectors {
    // Find share button SVGs directly (since :has() is not universally supported)
    // Matches both UI variations:
    // - Path-based: path[d^="M13.973"] (Spanish/EU version)
    // - Polygon-based: polygon[points*="11.698 20.334"] (US version)
    postWrapper = 'path[d^="M13.973"], polygon[points*="11.698 20.334"]',

    // Share button - paper plane icon (works for timeline, reel, and modal)
    // We'll find the SVG elements and traverse up to find the button
    // Multiple UI variations supported:
    // - path[d^="M13.973"] - Spanish/EU version with path element
    // - polygon[points*="11.698 20.334"] - US version with polygon element
    postShare = 'path[d^="M13.973"], polygon[points*="11.698 20.334"]',

    // Account name - semantic attributes, filters out post/reel links
    postAccountName = 'a[role="link"].notranslate[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]) span[dir="auto"]',
}
