# ScanFree

**Scan documents. Create PDFs. Completely free.**

ScanFree is a free, browser-based document scanner - like a CamScanner in your browser, but with no account, no payment, no watermark, and no uploads. All processing happens privately in your browser.

## Features

- Camera scanning with automatic document edge detection (rear camera preferred, front/rear switch, torch where supported)
- Manual corner adjustment with perspective correction, de-skew and auto-crop
- Filters: Original, Auto Enhance, Document, Black and White, Grayscale, Color
- Brightness, contrast, sharpness sliders and 90-degree rotation
- Multi-page documents: reorder by drag and drop, move, rotate, edit, retake, delete
- In-browser PDF creation: A4 / Letter / Automatic page sizes, Standard / High quality
- Download, Share (Web Share API) and Print
- Works offline as a Progressive Web App (PWA), installable on phones and desktops
- Light and dark modes, mobile-first responsive design, accessibility support

## Privacy

Your documents are processed privately in your browser. Nothing is uploaded, nothing is stored on a server, and nothing is used for analytics or AI training. See [privacy.html](privacy.html) and [terms.html](terms.html).

## Live site

https://lijuwahidulislam.github.io/scanfree/

## Pages

- index.html - the full app (landing, camera scanner, corner adjust, enhance, pages, preview, PDF success)
- privacy.html - Privacy Policy
- terms.html - Terms of Use
- help.html - Help and How It Works

## Tech notes

Pure HTML, CSS and JavaScript with no frameworks, no build step, and no external dependencies. The PDF is written byte-by-byte in the browser (PDF 1.4 with JPEG pages).
