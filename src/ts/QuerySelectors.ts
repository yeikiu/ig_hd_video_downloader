/**
 * A bunch of css selectors which get used by instagram
 */

export enum QuerySelectors {
    // Find share button SVGs directly (since :has() is not universally supported)
    // Matches both UI variations:
    // - Path-based: path[d^="M13.973"] (Spanish/EU version)
    // - Polygon-based: Multiple possible polygon coordinates (US version)
    // - Line-based: line elements with specific coordinates (fallback for both)
    postWrapper = 'path[d^="M13.973"], polygon[points*="11.698 20.334"], polygon[points*="22 3.001"], line[x1="22"][y1="3"], line[x1="7.488"][y1="12.208"]',

    // Share button - paper plane icon (works for timeline, reel, and modal)
    // We'll find the SVG elements and traverse up to find the button
    // Multiple UI variations supported:
    // - path[d^="M13.973"] - Spanish/EU version with path element
    // - polygon[points*="11.698 20.334"] or polygon[points*="22 3.001"] - US version polygon variations
    // - line elements - fallback that exists in both versions
    postShare = 'path[d^="M13.973"], polygon[points*="11.698 20.334"], polygon[points*="22 3.001"], line[x1="22"][y1="3"], line[x1="7.488"][y1="12.208"]',

    // Account name - semantic attributes, filters out post/reel links
    postAccountName = 'a[role="link"].notranslate[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]) span[dir="auto"]',
}
