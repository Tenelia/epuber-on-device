import { marked } from 'marked';
import { EpubAsset, EpubBookMetadata, EpubManifestItem, EpubParsedData, EpubSpineItem, EpubTocItem } from '../types';

export class TextParser {
  async parse(arrayBuffer: ArrayBuffer, bookId: string, fileName: string, isMarkdown: boolean): Promise<EpubParsedData> {
    const rawText = new TextDecoder('utf-8').decode(arrayBuffer);
    
    const assets: Record<string, EpubAsset> = {};
    const manifest: Record<string, EpubManifestItem> = {};
    const spine: EpubSpineItem[] = [];
    const toc: EpubTocItem[] = [];
    
    // Generate simple metadata
    const metadata: EpubBookMetadata = {
      title: fileName.replace(/\.(txt|md)$/gi, ''),
      creator: 'Unknown',
      language: 'en',
    };

    if (isMarkdown) {
      // Parse markdown to HTML
      const htmlContent = await marked.parse(rawText);
      
      // Try to find headers for TOC
      const lines = rawText.split('\n');
      let currentSectionHtml = '';
      let sectionIndex = 0;
      
      const sections = [];
      let currentSection = {
        title: 'Start',
        content: ''
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^#{1,3}\s+(.*)/)) {
          if (currentSection.content.trim()) {
            sections.push(currentSection);
          }
          currentSection = {
            title: line.replace(/^#{1,3}\s+/, '').trim(),
            content: line + '\n'
          };
        } else {
          currentSection.content += line + '\n';
        }
      }
      if (currentSection.content.trim()) {
        sections.push(currentSection);
      }

      for (let i = 0; i < sections.length; i++) {
        const sectionHtml = await marked.parse(sections[i].content);
        const sectionId = `section_${i}`;
        const href = `${sectionId}.html`;
        
        assets[href] = {
          data: new TextEncoder().encode(`<html><body>${sectionHtml}</body></html>`),
          mediaType: 'application/xhtml+xml'
        };
        
        manifest[sectionId] = {
          id: sectionId,
          href: href,
          mediaType: 'application/xhtml+xml'
        };
        
        spine.push({
          idref: sectionId,
          linear: true
        });
        
        toc.push({
          title: sections[i].title,
          href: href
        });
      }

    } else {
      // Simple text: split into chapters roughly by double newlines or chunks
      // For a novel, double newlines might denote paragraphs, so splitting by 500 lines or "Chapter"
      const chunks = rawText.split(/(?=\n\s*(Chapter \d+|CHAPTER \d+|Chapter [A-Z]+)\b)/i);
      
      if (chunks.length <= 1) {
        // Fallback: chunk by ~2000 lines
        const lines = rawText.split('\n');
        let currentChunk = '';
        let chunkIndex = 0;
        
        for (let i = 0; i < lines.length; i++) {
          currentChunk += lines[i] + '\n';
          if (i > 0 && i % 2000 === 0) {
            this.addTextSection(currentChunk, chunkIndex, assets, manifest, spine, toc);
            chunkIndex++;
            currentChunk = '';
          }
        }
        if (currentChunk.trim()) {
          this.addTextSection(currentChunk, chunkIndex, assets, manifest, spine, toc);
        }
      } else {
        chunks.forEach((chunk, i) => {
          if (chunk.trim()) {
            this.addTextSection(chunk, i, assets, manifest, spine, toc);
          }
        });
      }
    }

    return {
      id: bookId,
      metadata,
      manifest,
      spine,
      assets,
      toc,
      opfPath: 'content.opf' // dummy
    };
  }
  
  private addTextSection(text: string, index: number, assets: Record<string, EpubAsset>, manifest: Record<string, EpubManifestItem>, spine: EpubSpineItem[], toc: EpubTocItem[]) {
    const sectionId = `section_${index}`;
    const href = `${sectionId}.html`;
    
    // Convert newlines to breaks
    const htmlContent = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    const firstLine = text.trim().split('\n')[0].substring(0, 50);
    
    assets[href] = {
      data: new TextEncoder().encode(`<html><body><div>${htmlContent}</div></body></html>`),
      mediaType: 'application/xhtml+xml'
    };
    
    manifest[sectionId] = {
      id: sectionId,
      href: href,
      mediaType: 'application/xhtml+xml'
    };
    
    spine.push({
      idref: sectionId,
      linear: true
    });
    
    toc.push({
      title: index === 0 ? 'Start' : (firstLine || `Part ${index + 1}`),
      href: href
    });
  }
}
