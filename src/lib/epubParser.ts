/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { unzipSync } from 'fflate';
import { EpubAsset, EpubBookMetadata, EpubManifestItem, EpubParsedData, EpubSpineItem, EpubTocItem } from '../types';

export class EpubParser {
  private parser = new DOMParser();

  /**
   * Normalizes and resolves relative directory paths correctly (mimicking browser relative anchors).
   */
  public resolveRelativeUrl(basePath: string, relativePath: string): string {
    // If it's absolute, return as-is
    if (relativePath.includes('://') || relativePath.startsWith('data:')) {
      return relativePath;
    }
    
    // Ignore leading hash references (same-document jumping)
    if (relativePath.startsWith('#')) {
      return basePath + relativePath;
    }

    const baseParts = basePath.split('/').filter(Boolean);
    // Grab the anchor part if present (e.g. text/chapter.xhtml#sub-section)
    const hashIndex = relativePath.indexOf('#');
    let hash = '';
    let cleanRelative = relativePath;
    if (hashIndex !== -1) {
      hash = relativePath.substring(hashIndex);
      cleanRelative = relativePath.substring(0, hashIndex);
    }

    const relativeParts = cleanRelative.split('/');

    for (const part of relativeParts) {
      if (part === '.' || part === '') {
        continue;
      } else if (part === '..') {
        baseParts.pop();
      } else {
        baseParts.push(part);
      }
    }

    return baseParts.join('/') + hash;
  }

  /**
   * Resolves a relative path to the actual exact-casing key present inside the unzipped archive.
   * If there is an anchor hash fragment, it will be decoupled, matched, and appended back.
   */
  public getActualZipKeyWithFragment(rawFiles: Record<string, Uint8Array>, resolvedPath: string): string {
    const hashIndex = resolvedPath.indexOf('#');
    let hash = '';
    let cleanPath = resolvedPath;
    if (hashIndex !== -1) {
      hash = resolvedPath.substring(hashIndex);
      cleanPath = resolvedPath.substring(0, hashIndex);
    }

    const normalizedPath = cleanPath.replace(/\\/g, '/').replace(/^\//, '');
    const lowerPath = normalizedPath.toLowerCase();

    // 1. Exact match check
    if (rawFiles[normalizedPath] !== undefined) {
      return normalizedPath + hash;
    }

    // 2. Case-insensitive search
    const matchedKey = Object.keys(rawFiles).find(key => {
      const kNorm = key.replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
      return kNorm === lowerPath;
    });

    if (matchedKey) {
      return matchedKey + hash;
    }

    // Return fallback clean normalized if not found
    return normalizedPath + hash;
  }

  /**
   * Parses an EPUB archive represented as an ArrayBuffer.
   */
  async parse(arrayBuffer: ArrayBuffer, bookId: string): Promise<EpubParsedData> {
    const rawUnzipped = unzipSync(new Uint8Array(arrayBuffer));
    
    // Normalize and filter all unzipped document paths
    const rawFiles: Record<string, Uint8Array> = {};
    for (const [key, val] of Object.entries(rawUnzipped)) {
      if (key.endsWith('/')) continue; // Skip directory structures
      const normalizedKey = key.replace(/\\/g, '/').replace(/^\//, '');
      rawFiles[normalizedKey] = val;
    }
    
    // 1. Read container.xml case-insensitively to locate the OPF package path
    const containerKey = Object.keys(rawFiles).find(key => key.toLowerCase() === 'meta-inf/container.xml');
    const containerData = containerKey ? rawFiles[containerKey] : null;
    if (!containerData) {
      throw new Error('Invalid EPUB: Missing META-INF/container.xml');
    }

    const containerXml = new TextDecoder('utf-8').decode(containerData);
    const containerDoc = this.parser.parseFromString(containerXml, 'text/xml');
    
    // Check for XML parsing errors
    if (containerDoc.querySelector('parsererror')) {
      throw new Error('Failed to parse container.xml - invalid XML syntax.');
    }

    const rootFileEl = containerDoc.querySelector('rootfile');
    let opfPath = rootFileEl?.getAttribute('full-path');

    if (!opfPath) {
      // Fallback: search for any .opf extension
      const firstOpfKey = Object.keys(rawFiles).find(key => key.toLowerCase().endsWith('.opf'));
      if (firstOpfKey) {
        opfPath = firstOpfKey;
      } else {
        throw new Error('Invalid EPUB: Unable to locate package document (.opf)');
      }
    } else {
      opfPath = this.getActualZipKeyWithFragment(rawFiles, opfPath);
    }

    const opfData = rawFiles[opfPath];
    if (!opfData) {
      throw new Error(`Missing package descriptor file at: ${opfPath}`);
    }

    const opfXml = new TextDecoder('utf-8').decode(opfData);
    const opfDoc = this.parser.parseFromString(opfXml, 'text/xml');

    if (opfDoc.querySelector('parsererror')) {
      throw new Error('Failed to parse content.opf - invalid XML syntax.');
    }

    // 2. Extract Base Directory of OPF file inside ZIP to handle relative routes
    const opfBaseDir = opfPath.includes('/') 
      ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) 
      : '';

    // 3. Parse Metadata (Namespaced DC elements)
    const metadata: EpubBookMetadata = {
      title: this.getXmlNodeText(opfDoc, ['dc\\:title', 'title']) || 'Untitled Book',
      creator: this.getXmlNodeText(opfDoc, ['dc\\:creator', 'creator']) || 'Unknown Author',
      language: this.getXmlNodeText(opfDoc, ['dc\\:language', 'language']) || 'en',
      publisher: this.getXmlNodeText(opfDoc, ['dc\\:publisher', 'publisher']) || '',
      description: this.getXmlNodeText(opfDoc, ['dc\\:description', 'description']) || '',
    };

    // 4. Parse Manifest and normalize its file target casing
    const manifest: Record<string, EpubManifestItem> = {};
    const manifestElements = opfDoc.querySelectorAll('manifest > item');
    
    manifestElements.forEach((el) => {
      const id = el.getAttribute('id');
      const href = el.getAttribute('href');
      const mediaType = el.getAttribute('media-type');
      const properties = el.getAttribute('properties');
      
      if (id && href && mediaType) {
        // Hrefs are relative to OPF base directory inside the archive
        const normalizedHref = this.resolveRelativeUrl(opfBaseDir, href);
        const resolvedHref = this.getActualZipKeyWithFragment(rawFiles, normalizedHref);
        manifest[id] = {
          id,
          href: resolvedHref,
          mediaType,
          properties: properties || undefined
        };
      }
    });

    // 5. Parse Spine Index
    const spine: EpubSpineItem[] = [];
    const spineElements = opfDoc.querySelectorAll('spine > itemref');
    
    spineElements.forEach((el) => {
      const idref = el.getAttribute('idref');
      const linear = el.getAttribute('linear');
      if (idref) {
        spine.push({
          idref,
          linear: linear !== 'no'
        });
      }
    });

    // 6. Build In-Memory Assets mapping and infer matching media-types
    // Populate both current casing and lowercase versions of keys to prevent failed access in viewer frame
    const assets: Record<string, EpubAsset> = {};
    for (const [filePath, fileData] of Object.entries(rawFiles)) {
      // Find corresponding manifest entry to retrieve verified mime-type
      const manifestItem = Object.values(manifest).find(item => item.href === filePath);
      const mediaType = manifestItem?.mediaType || this.inferMimeType(filePath);

      const assetItem: EpubAsset = {
        data: fileData,
        mediaType
      };

      assets[filePath] = assetItem;
      assets[filePath.toLowerCase()] = assetItem;
    }

    // 7. Parse Table of Contents (Supports EPUB 3 Nav and EPUB 2 NCX formats)
    let toc: EpubTocItem[] = [];
    
    // Attempt A: EPUB 3 Navigation Document
    const navItem = Object.values(manifest).find(
      item => item.properties?.includes('nav') || item.mediaType === 'application/xhtml+xml' && item.id === 'nav'
    );
    
    if (navItem && rawFiles[navItem.href]) {
      toc = this.parseEpub3Toc(rawFiles[navItem.href], navItem.href, rawFiles);
    } 
    
    // Attempt B (Fallback): EPUB 2 NCX file
    if (toc.length === 0) {
      const ncxItem = Object.values(manifest).find(
        item => item.mediaType === 'application/x-dtbncx+xml' || item.href.endsWith('.ncx')
      );
      if (ncxItem && rawFiles[ncxItem.href]) {
        toc = this.parseEpub2Toc(rawFiles[ncxItem.href], ncxItem.href, rawFiles);
      }
    }

    // Attempt C (Greedy fallback): If TOC is empty, map all linear spine elements in order
    if (toc.length === 0) {
      spine.forEach((spineItem, index) => {
        const item = manifest[spineItem.idref];
        if (item) {
          const displayTitle = item.href.substring(item.href.lastIndexOf('/') + 1)
            .replace(/\.xhtml$|\.html$/gi, '')
            .replace(/[-_]/g, ' ');
          toc.push({
            title: `Section ${index + 1}: ${this.capitalizeString(displayTitle)}`,
            href: item.href
          });
        }
      });
    }

    // 8. Extract Cover Image Link
    let coverBlobUrl: string | undefined;
    let coverId = metadata.coverId;

    // Check for meta cover pointer
    if (!coverId) {
      const metaCover = opfDoc.querySelector('meta[name="cover"]');
      if (metaCover) {
        coverId = metaCover.getAttribute('content') || undefined;
      }
    }

    // Direct manifest cover indicators
    let coverItem = coverId ? manifest[coverId] : null;
    if (!coverItem) {
      coverItem = Object.values(manifest).find(
        item => item.properties?.includes('cover-image') || 
                item.id.toLowerCase() === 'cover' || 
                item.id.toLowerCase() === 'cover-image'
      ) || null;
    }

    if (!coverItem) {
      // Find any image files containing 'cover' inside path
      coverItem = Object.values(manifest).find(
        item => item.mediaType.startsWith('image/') && item.href.toLowerCase().includes('cover')
      ) || null;
    }

    if (coverItem && assets[coverItem.href]) {
      const asset = assets[coverItem.href];
      const blob = new Blob([asset.data], { type: asset.mediaType });
      coverBlobUrl = URL.createObjectURL(blob);
      asset.blobUrl = coverBlobUrl; // Save reference
    }

    return {
      id: bookId,
      metadata,
      manifest,
      spine,
      assets,
      toc,
      opfPath,
      coverBlobUrl
    };
  }

  /**
   * Helper to fetch text contents of various namespaced tags
   */
  private getXmlNodeText(doc: Document, selectors: string[]): string | null {
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      if (node && node.textContent) {
        return node.textContent.trim();
      }
    }
    return null;
  }

  /**
   * Parse EPUB 3 XHTML Navigation markup
   */
  private parseEpub3Toc(fileData: Uint8Array, navFileHref: string, rawFiles: Record<string, Uint8Array>): EpubTocItem[] {
    const toc: EpubTocItem[] = [];
    const htmlText = new TextDecoder('utf-8').decode(fileData);
    const doc = this.parser.parseFromString(htmlText, 'text/html');
    
    // Extract folder containing the nav file to resolve links
    const navDir = navFileHref.includes('/') 
      ? navFileHref.substring(0, navFileHref.lastIndexOf('/') + 1)
      : '';

    // Search specifically for matches according to EPUB3 specs
    const tocNav = doc.querySelector('nav[*|type="toc"], nav[epub\\:type="toc"], nav.toc, nav');
    if (tocNav) {
      const anchors = tocNav.querySelectorAll('a');
      anchors.forEach((a) => {
        const text = a.textContent?.trim() || '';
        const href = a.getAttribute('href');
        if (text && href) {
          const absoluteHref = this.resolveRelativeUrl(navDir, href);
          const finalHref = this.getActualZipKeyWithFragment(rawFiles, absoluteHref);
          toc.push({
            title: text,
            href: finalHref
          });
        }
      });
    }

    return toc;
  }

  /**
   * Parse EPUB 2 NCX table of contents
   */
  private parseEpub2Toc(fileData: Uint8Array, ncxFileHref: string, rawFiles: Record<string, Uint8Array>): EpubTocItem[] {
    const toc: EpubTocItem[] = [];
    const xmlText = new TextDecoder('utf-8').decode(fileData);
    const doc = this.parser.parseFromString(xmlText, 'text/xml');
    
    // Extract folder containing the NCX file
    const ncxDir = ncxFileHref.includes('/') 
      ? ncxFileHref.substring(0, ncxFileHref.lastIndexOf('/') + 1)
      : '';

    const navPoints = doc.querySelectorAll('navPoint');
    navPoints.forEach((point) => {
      // NCX labels may be nested
      const textNode = point.querySelector('navLabel > text');
      const contentNode = point.querySelector('content');
      
      const title = textNode?.textContent?.trim();
      const href = contentNode?.getAttribute('src');

      if (title && href) {
        const absoluteHref = this.resolveRelativeUrl(ncxDir, href);
        const finalHref = this.getActualZipKeyWithFragment(rawFiles, absoluteHref);
        // Avoid inserting duplicate nodes if selectAll returned nested matches
        if (!toc.some(item => item.href === finalHref)) {
          toc.push({
            title,
            href: finalHref
          });
        }
      }
    });

    return toc;
  }

  private capitalizeString(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private inferMimeType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'css': return 'text/css';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'gif': return 'image/gif';
      case 'svg': return 'image/svg+xml';
      case 'xhtml':
      case 'html': return 'application/xhtml+xml';
      case 'ttf': return 'font/ttf';
      case 'otf': return 'font/otf';
      case 'woff': return 'font/woff';
      case 'woff2': return 'font/woff2';
      default: return 'application/octet-stream';
    }
  }
}
