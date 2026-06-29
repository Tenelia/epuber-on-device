/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { EpubChapter, EpubParsedData, ReaderSettings } from '../types';

interface ReaderFrameProps {
  book: EpubParsedData;
  chapter: EpubChapter;
  settings: ReaderSettings;
  currentPageIndex: number;
  onPageCountChange: (count: number) => void;
  onPageIndexChange: (index: number) => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onCenterClick: () => void;
}

export default function ReaderFrame({
  book,
  chapter,
  settings,
  currentPageIndex,
  onPageCountChange,
  onPageIndexChange,
  onPrevChapter,
  onNextChapter,
  onCenterClick
}: ReaderFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isIframeLoaded, setIsIframeLoaded] = useState(false);
  const localBlobUrlsRef = useRef<string[]>([]);

  // Cleanup all allocated Blob URLs to avoid browser memory leaks
  const cleanupBlobs = useCallback(() => {
    localBlobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    localBlobUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cleanupBlobs();
    };
  }, [cleanupBlobs]);

  // Transform relative paths inside chapter content to dynamic Blob URLs
  const resolveAndRewriteHtml = useCallback((rawHtml: string, chapterHref: string): string => {
    cleanupBlobs();

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'application/xhtml+xml');
    
    const baseDir = chapterHref.includes('/')
      ? chapterHref.substring(0, chapterHref.lastIndexOf('/') + 1)
      : '';

    // Resolves simple absolute path in files
    const resolvePath = (relPath: string) => {
      // absolute links inside EPUB package ZIP
      if (relPath.includes('://') || relPath.startsWith('data:')) {
        return relPath;
      }
      
      const cleanRel = relPath.split('#')[0]; // strip hash for ZIP keylookup
      const segments = baseDir.split('/').filter(Boolean);
      const relSegments = cleanRel.split('/');
      
      for (const segment of relSegments) {
        if (segment === '.' || segment === '') continue;
        if (segment === '..') {
          segments.pop();
        } else {
          segments.push(segment);
        }
      }
      return segments.join('/');
    };

    // 1. Rewrite Images
    const imgs = doc.querySelectorAll('img, image');
    imgs.forEach((el) => {
      const srcAttr = el.tagName.toLowerCase() === 'image' ? 'xlink:href' : 'src';
      const relSrc = el.getAttribute(srcAttr);
      if (relSrc) {
        const fullPath = resolvePath(relSrc);
        const asset = book.assets[fullPath] || book.assets[fullPath.toLowerCase()];
        if (asset) {
          if (!asset.blobUrl) {
            const blob = new Blob([asset.data as any], { type: asset.mediaType });
            asset.blobUrl = URL.createObjectURL(blob);
          }
          if (!localBlobUrlsRef.current.includes(asset.blobUrl)) {
            localBlobUrlsRef.current.push(asset.blobUrl);
          }
          el.setAttribute(srcAttr, asset.blobUrl);
        }
      }
    });

    // 2. Rewrite Inline Stylesheets with CSS Blob injections
    const stylesheets = doc.querySelectorAll('link[rel="stylesheet"]');
    stylesheets.forEach((link) => {
      const relHref = link.getAttribute('href');
      if (relHref) {
        const fullPath = resolvePath(relHref);
        const asset = book.assets[fullPath] || book.assets[fullPath.toLowerCase()];
        if (asset) {
          // Parse internal stylesheet string to rewrite internal CSS background/font urls
          let cssText = new TextDecoder('utf-8').decode(asset.data);
          const cssBaseDir = fullPath.includes('/') 
            ? fullPath.substring(0, fullPath.lastIndexOf('/') + 1)
            : '';

          cssText = cssText.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, urlPath) => {
            if (urlPath.includes('://') || urlPath.startsWith('data:')) return match;
            const absoluteAssetPath = resolvePath(urlPath);
            const subAsset = book.assets[absoluteAssetPath] || book.assets[absoluteAssetPath.toLowerCase()];
            if (subAsset) {
              if (!subAsset.blobUrl) {
                const subBlob = new Blob([subAsset.data as any], { type: subAsset.mediaType });
                subAsset.blobUrl = URL.createObjectURL(subBlob);
              }
              if (!localBlobUrlsRef.current.includes(subAsset.blobUrl)) {
                localBlobUrlsRef.current.push(subAsset.blobUrl);
              }
              return `url("${subAsset.blobUrl}")`;
            }
            return match;
          });

          const cssBlob = new Blob([cssText], { type: 'text/css' });
          const cssBlobUrl = URL.createObjectURL(cssBlob);
          localBlobUrlsRef.current.push(cssBlobUrl);
          link.setAttribute('href', cssBlobUrl);
        }
      }
    });

    return new XMLSerializer().serializeToString(doc);
  }, [book, cleanupBlobs]);

  // Generate Injectable Stylings customized to visual settings
  const getInjectedStyles = useCallback((): string => {
    const s = settings;
    const themeColors = {
      light: { bg: '#FAF9F6', text: '#212529', primary: '#6366f1' },
      dark: { bg: '#0c0c0e', text: '#e2e8f0', primary: '#818cf8' },
      sepia: { bg: '#F4ECD8', text: '#433422', primary: '#a35003' },
      contrast: { bg: '#000000', text: '#FFFFFF', primary: '#00FF00' }
    };
    const colors = themeColors[s.theme] || themeColors.light;

    const fontValue = {
      'sans-serif': '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
      'serif': 'Georgia, Cambria, "Times New Roman", Times, "Playfair Display", serif',
      'monospace': '"JetBrains Mono", Fira Code, Courier, monospace',
      'opendyslexic': '"OpenDyslexic", Arial, "Comic Sans MS", sans-serif'
    }[s.fontFamily] || '-apple-system, BlinkMacSystemFont, sans-serif';

    // Inject OpenDyslexic font definition if selected
    const dyslexicFontImport = s.fontFamily === 'opendyslexic' 
      ? `@font-face {
           font-family: "OpenDyslexic";
           src: url("https://cdn.jsdelivr.net/npm/opendyslexic@1.0.3/dist/woff2/OpenDyslexic-Regular.woff2") format("woff2");
           font-weight: normal;
           font-style: normal;
         }` 
      : '';

    return `
      ${dyslexicFontImport}

      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap');

      html {
        background-color: ${colors.bg} !important;
        color: ${colors.text} !important;
        transition: background-color 0.25s ease, color 0.25s ease;
        height: 100% !important;
        width: 100% !important;
        overflow-y: ${s.paginated ? 'hidden' : 'auto'} !important;
        overflow-x: ${s.paginated ? 'scroll' : 'hidden'} !important;
        box-sizing: border-box !important;
        scrollbar-width: ${s.paginated ? 'none' : 'auto'} !important; /* Firefox/Edge scrollbar hiding */
        -ms-overflow-style: ${s.paginated ? 'none' : 'auto'} !important;

        /* Reactive CSS Custom properties for dynamic device layout bounds */
        --vertical-padding: 80px;
        --horizontal-padding: 120px;
      }

      ${s.paginated ? `
      /* Completely suppress native scrollbars inside paginated reading columns */
      html::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
      ` : ''}

      /* Breakpoint definitions for adaptive padding heights */
      @media (max-width: 639px) {
        html {
          --vertical-padding: 40px;
          --horizontal-padding: 40px;
        }
      }
      @media (min-width: 640px) and (max-width: 1023px) {
        html {
          --vertical-padding: 48px;
          --horizontal-padding: 64px;
        }
      }
      @media (min-width: 1024px) {
        html {
          --vertical-padding: 80px;
          --horizontal-padding: 120px;
        }
      }

      body {
        margin: 0 !important;
        height: 100% !important;
        width: 100% !important;
        box-sizing: border-box !important;
        font-family: ${fontValue} !important;
        font-size: ${s.fontSize}% !important;
        line-height: ${s.lineHeight} !important;
        background-color: transparent !important;
        color: inherit !important;
        text-align: justify !important;
        transform: translateZ(0); /* Hardware accelerate pagination */

        ${s.paginated ? `
          column-fill: auto !important;
          height: 100% !important;
          overflow-x: hidden !important;
          overflow-y: hidden !important;
          box-sizing: border-box !important;

          padding: calc(var(--vertical-padding) / 2) calc(var(--horizontal-padding) / 2) !important;
          column-gap: calc(var(--horizontal-padding) / 2) !important;
          column-width: ${s.doublePage ? 'calc((100vw - (var(--horizontal-padding) * 1.5)) / 2)' : 'calc(100vw - var(--horizontal-padding))'} !important;
        ` : `
          max-width: 760px !important;
          margin: 0 auto !important;
          padding: 40px 24px 80px 24px !important;
          height: auto !important;
          overflow-y: auto !important;
        `}
      }

      /* Fluid bounds for generic wrapper/formatting elements */
      div, p, span, blockquote, table, tr, td, header, section, article {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* Neutralize fixed inline layout dimensions inside raw EPUB files */
      [style*="width"], [style*="height"] {
        max-width: 100% !important;
      }

      p {
        margin-top: 0 !important;
        margin-bottom: 1.25em !important;
        text-indent: 1.5em;
      }

      p:first-of-type {
        text-indent: 0 !important;
      }

      /* Scale inline SVGs, covers, and illustrations cleanly preserving aspect ratios */
      svg {
        max-width: 100% !important;
        height: auto !important;
        max-height: ${s.paginated ? 'calc(100% - var(--vertical-padding) - 30px)' : '100%'} !important;
        display: block !important;
        margin: 1.5em auto !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      svg image, img {
        max-width: 100% !important;
        height: auto !important;
        object-fit: contain !important;
        margin: 1.5em auto !important;
        display: block !important;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        ${s.paginated ? `max-height: calc(100% - var(--vertical-padding) - 30px) !important;` : ''}
      }

      h1, h2, h3, h4, h5, h6 {
        font-family: ${fontValue} !important;
        color: ${colors.text} !important;
        line-height: 1.2 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.5em !important;
        font-weight: 600 !important;
        break-after: avoid !important;
        page-break-after: avoid !important;
        text-align: left !important;
      }

      a {
        color: ${colors.primary} !important;
        text-decoration: underline !important;
      }

      /* Clean scrollbars inside continuous vertical scroll */
      ::-webkit-scrollbar {
        ${s.paginated ? 'display: none !important; width: 0 !important; height: 0 !important;' : `
        width: 6px;
        height: 6px;
        `}
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(125,125,125,0.25);
        border-radius: 4px;
      }
    `;
  }, [settings]);

  // Calculate layout geometry of the HTML document
  const calculateGeometry = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) return;

    if (settings.paginated) {
      const scrollWidth = doc.documentElement.scrollWidth;
      const viewWidth = win.innerWidth;

      // Ensure viewWidth is not zero to prevent division by zero
      if (viewWidth > 0) {
        // Round to nearest integer page column count
        const calculatedPages = Math.max(1, Math.round(scrollWidth / viewWidth));
        onPageCountChange(calculatedPages);
      }
    } else {
      onPageCountChange(1);
      onPageIndexChange(0);
    }
  }, [settings.paginated, onPageCountChange, onPageIndexChange]);

  // Synchronizes ScrollLeft index based on page offset
  const syncPageOffset = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !settings.paginated) return;

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc) return;

    const targetOffset = currentPageIndex * win.innerWidth;
    
    // Universally scroll the window viewport as well as document elements for absolute compatibility
    win.scrollTo({
      left: targetOffset,
      top: 0,
      behavior: 'smooth'
    });
    
    // Fallback direct writes for strict or custom container environments
    if (doc.documentElement) doc.documentElement.scrollLeft = targetOffset;
    if (doc.body) doc.body.scrollLeft = targetOffset;
  }, [currentPageIndex, settings.paginated]);

  // Load and inject compiled chapter
  const loadChapterContent = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !chapter) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const parsedContent = resolveAndRewriteHtml(chapter.content, chapter.href);

    // Open stream and write rewritten XHTML
    doc.open();
    doc.write(parsedContent);
    doc.close();

    // Inject our Custom Styling override block
    const existingStyles = doc.getElementById('epub-reader-injected-styles');
    if (existingStyles) {
      existingStyles.remove();
    }

    const styleEl = doc.createElement('style');
    styleEl.id = 'epub-reader-injected-styles';
    styleEl.textContent = getInjectedStyles();
    doc.head.appendChild(styleEl);

    // Configure accessibility on iframe viewport
    doc.body.setAttribute('role', 'document');
    doc.body.setAttribute('aria-label', `Book content: ${chapter.title}`);

    // Set up internal clicks monitoring to turn pages or toggle drawer
    doc.addEventListener('click', (e: MouseEvent) => {
      const x = e.clientX;
      const width = doc.documentElement.clientWidth;
      
      const leftBoundary = width * 0.22;
      const rightBoundary = width * 0.78;

      if (settings.paginated) {
        if (x < leftBoundary) {
          // Turn Page Left
          e.preventDefault();
          if (currentPageIndex > 0) {
            onPageIndexChange(currentPageIndex - 1);
          } else {
            onPrevChapter();
          }
        } else if (x > rightBoundary) {
          // Turn Page Right
          e.preventDefault();
          onNextChapter();
        } else {
          // Center Toggle Display
          onCenterClick();
        }
      } else {
        // Continuous scroll mode - Center click toggle rules
        onCenterClick();
      }
    });

    // Add Swipe & Touch Gestures for Handphones and Tablets
    let startX = 0;
    let endX = 0;
    doc.addEventListener('touchstart', (e: TouchEvent) => {
      startX = e.touches[0].clientX;
    }, { passive: true });

    doc.addEventListener('touchend', (e: TouchEvent) => {
      endX = e.changedTouches[0].clientX;
      const diffX = startX - endX;
      
      if (settings.paginated && Math.abs(diffX) > 55) {
        if (diffX > 0) {
          // Swipe Left -> Next Page
          onNextChapter(); // Parent container dictates if it moves to next index or next chapter
        } else {
          // Swipe Right -> Prev Page
          if (currentPageIndex > 0) {
            onPageIndexChange(currentPageIndex - 1);
          } else {
            onPrevChapter();
          }
        }
      }
    }, { passive: true });

    // Add load event listeners to each image inside the iframe context
    // This resolves any layout page counts getting out of sync when heavy images finish loading
    const rawImages = doc.querySelectorAll('img, image');
    rawImages.forEach((img) => {
      img.addEventListener('load', () => {
        calculateGeometry();
        syncPageOffset();
      });
    });

    // Allow window scaling passes to set layout calculations
    setTimeout(() => {
      calculateGeometry();
      setIsIframeLoaded(true);
    }, 150);
  }, [
    chapter,
    resolveAndRewriteHtml,
    getInjectedStyles,
    calculateGeometry,
    currentPageIndex,
    onPageIndexChange,
    onPrevChapter,
    onNextChapter,
    onCenterClick,
    settings.paginated
  ]);

  // Reload on chapter change
  useEffect(() => {
    loadChapterContent();
  }, [chapter, loadChapterContent]);

  // Sync scroll positioning on index change
  useEffect(() => {
    if (isIframeLoaded) {
      syncPageOffset();
    }
  }, [currentPageIndex, syncPageOffset, isIframeLoaded]);

  // Re-calculate layouts on zoom-font and layout changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (doc) {
      const styleEl = doc.getElementById('epub-reader-injected-styles');
      if (styleEl) {
        styleEl.textContent = getInjectedStyles();
      }
    }

    setTimeout(() => {
      calculateGeometry();
      syncPageOffset();
    }, 120);
  }, [settings, getInjectedStyles, calculateGeometry, syncPageOffset]);

  // Hook ResizeObserver on our outer container div rather than just window resize.
  // This accurately catches screen resizing, sidebar adjustments, container scale-transitions and rotations.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeTimer: number;

    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        calculateGeometry();
        syncPageOffset();
      }, 60);
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, [calculateGeometry, syncPageOffset]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none" 
      style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
    >
      <iframe
        ref={iframeRef}
        title="EPUB Chapter Viewport"
        sandbox="allow-same-origin allow-scripts"
        className="border-none m-0 p-0 block bg-transparent"
        style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
        role="document"
        aria-label="Responsive book reading frame"
      />
    </div>
  );
}
