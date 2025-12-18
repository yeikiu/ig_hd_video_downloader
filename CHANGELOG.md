# Changelog

All notable changes to this project will be documented in this file.

## [2.0.2] - 2025-12-18

### Fixed
- **Cross-Region Compatibility**: Fixed share button detection to work across different Instagram UI versions in different regions (US, EU, etc.).
  - Removed dependency on `:has()` CSS pseudo-class which is not supported in all browsers.
  - Implemented DOM traversal approach to find share buttons using multiple SVG element selectors.
  - Added support for both `<path>` elements (EU/Spanish version) and `<polygon>` elements (US version) in share button detection.
  - Added fallback selectors using `<line>` elements present in both UI variations.

## [2.0.1] - 2025-12-15

### Added
- **WhatsApp Compatible Mode**: New option in settings to ensure downloaded videos are fully compatible with WhatsApp.
  - Adds a specific post-processing step to fix encoding issues often encountered when sharing on WhatsApp.
- **Progress Indicator**: The "Processing video" notification now displays real-time percentage progress of the FFmpeg conversion.
- **Contextual Alerts**: Status messages now explicitly state if "WhatsApp Mode" is active to manage user expectations regarding processing time.


## [2.0.0] - 2025-12-01

### Added
- Initial release of the "Minimal" version.
- **FFmpeg Integration**: Client-side video and audio merging using `ffmpeg.wasm`.
- **High Quality Audio**: Automatically detects and merges the highest quality audio stream available (DASH).
- **Video Support**: Support for downloading Posts, Reels, and Carousels.
- **Offscreen Document**: Moves heavy processing to an offscreen document to keep the browser responsive.
