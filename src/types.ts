/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EpubBookMetadata {
  title: string;
  creator: string;
  language?: string;
  publisher?: string;
  description?: string;
  coverId?: string;
}

export interface EpubManifestItem {
  id: string;
  href: string; // Absolute path inside the ZIP (e.g. OEBPS/xhtml/content01.xhtml)
  mediaType: string;
  properties?: string;
}

export interface EpubSpineItem {
  idref: string;
  linear?: boolean;
}

export interface EpubChapter {
  id: string;
  href: string;
  title: string;
  content: string; // Restructured XHTML body content
  index: number;
}

export interface EpubAsset {
  data: Uint8Array;
  mediaType: string;
  blobUrl?: string; // Generated on-demand for rendering
}

export interface EpubTocItem {
  title: string;
  href: string; // Absolute path inside ZIP, possibly with an id hash fragment (#section1)
}

export interface EpubParsedData {
  id: string; // Hash or unique identifier (we'll use filename/timestamp)
  metadata: EpubBookMetadata;
  manifest: Record<string, EpubManifestItem>;
  spine: EpubSpineItem[];
  assets: Record<string, EpubAsset>;
  toc: EpubTocItem[];
  opfPath: string;
  coverBlobUrl?: string;
}

export type ReaderTheme = 'light' | 'dark' | 'sepia' | 'contrast';

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: number; // Percent: e.g., 100, 125, 150, 175, 200
  lineHeight: number; // e.g., 1.4, 1.6, 1.8, 2.0
  fontFamily: string; // 'sans-serif' | 'serif' | 'monospace' | 'opendyslexic'
  paginated: boolean; // Column pagination vs vertical scroll
  doublePage: boolean; // Side-by-side pages on large screens
}

export interface BookProgress {
  bookId: string;
  currentSpineIndex: number;
  currentPageIndex: number;
  scrollPosition?: number;
  lastRead: number;
}

export interface LocalBookRecord {
  id: string;
  name: string;
  data: ArrayBuffer;
  addedAt: number;
}
