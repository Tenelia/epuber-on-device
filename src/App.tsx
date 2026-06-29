/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, useCallback, DragEvent } from 'react';
import { 
  Plus, 
  Menu, 
  Settings, 
  BookOpen, 
  ChevronLeft, 
  ChevronRight, 
  FileText,
  Upload,
  Library,
  HelpCircle,
  ArrowRight,
  Bookmark,
  Languages
} from 'lucide-react';

import { 
  EpubParsedData, 
  ReaderSettings, 
  BookProgress 
} from './types';
import { LibraryDb } from './lib/libraryDb';
import { EpubParser } from './lib/epubParser';
import { TextParser } from './lib/textParser';
import ReaderFrame from './components/ReaderFrame';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import TranslateMenu from './components/TranslateMenu';

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'light',
  fontSize: 100,
  lineHeight: 1.6,
  fontFamily: 'serif',
  paginated: true,
  doublePage: false
};

export default function App() {
  // Parsing services & persistence instances
  const dbRef = useRef<LibraryDb | null>(null);
  const parserRef = useRef<EpubParser | null>(null);
  const textParserRef = useRef<TextParser | null>(null);

  // Application Layout States
  const [savedBooks, setSavedBooks] = useState<{ id: string; name: string; addedAt: number }[]>([]);
  const [currentBook, setCurrentBook] = useState<EpubParsedData | null>(null);
  const [currentSpineIndex, setCurrentSpineIndex] = useState<number>(0);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  
  // UI Display Toggles
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTranslateOpen, setIsTranslateOpen] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Tracking page transitions between chapters
  const transitionDirectionRef = useRef<'start' | 'end'>('start');

  // Initialize DB and pull records
  useEffect(() => {
    dbRef.current = new LibraryDb();
    parserRef.current = new EpubParser();
    textParserRef.current = new TextParser();

    const bootApp = async () => {
      try {
        if (dbRef.current) {
          await dbRef.current.init();
          const list = await dbRef.current.listBooks();
          setSavedBooks(list);
        }

        // Restore reader typography setups from LocalStorage
        const cached = localStorage.getItem('epub_reader_local_settings');
        if (cached) {
          setSettings(JSON.parse(cached));
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };
    bootApp();
  }, []);

  // Sync settings updates to LocalStorage safely
  const updateSettings = useCallback((updater: (prev: ReaderSettings) => ReaderSettings) => {
    setSettings((prev) => {
      const next = updater(prev);
      localStorage.setItem('epub_reader_local_settings', JSON.stringify(next));
      return next;
    });
  }, []);

  // Compute active reading chapter resource details
  const currentChapter = useMemo(() => {
    if (!currentBook) return null;
    const spineElement = currentBook.spine[currentSpineIndex];
    if (!spineElement) return null;

    const manifestItem = currentBook.manifest[spineElement.idref];
    if (!manifestItem) return null;

    const asset = currentBook.assets[manifestItem.href];
    if (!asset) return null;

    const decodedContent = new TextDecoder('utf-8').decode(asset.data);
    return {
      id: manifestItem.id,
      href: manifestItem.href,
      title: manifestItem.id,
      content: decodedContent,
      index: currentSpineIndex
    };
  }, [currentBook, currentSpineIndex]);

  // Compute matching visual title representing the chapters in the TOC list
  const activeChapterTitle = useMemo(() => {
    if (!currentBook || !currentChapter) return 'Untitled Chapter';
    
    // Find matching link inside Table of Contents
    const matchedToc = currentBook.toc.find((item) => {
      const cleanHref = item.href.split('#')[0].toLowerCase();
      const cleanChapterHref = currentChapter.href.split('#')[0].toLowerCase();
      return cleanHref.includes(cleanChapterHref) || cleanChapterHref.includes(cleanHref);
    });

    if (matchedToc) return matchedToc.title;

    return `Chapter ${currentSpineIndex + 1}`;
  }, [currentBook, currentChapter, currentSpineIndex]);

  // Handle saving user placements in backgrounds
  const persistReadingProgress = useCallback(async (spineIdx: number, pageIdx: number) => {
    if (!currentBook || !dbRef.current) return;
    const progress: BookProgress = {
      bookId: currentBook.id,
      currentSpineIndex: spineIdx,
      currentPageIndex: pageIdx,
      lastRead: Date.now()
    };
    try {
      await dbRef.current.saveProgress(progress);
    } catch (err) {
      console.warn('Could not persist progression indices:', err);
    }
  }, [currentBook]);

  // Trigger loading details of an added book from cache
  const loadBook = useCallback(async (id: string) => {
    if (!dbRef.current || !parserRef.current || !textParserRef.current) return;
    setStatusMessage('Parsing local EPUB uncompressed data...');
    try {
      const buffer = await dbRef.current.getBook(id);
      if (!buffer) {
        throw new Error('Requested book file was not found inside local Database storage.');
      }

      let parsedData;
      if (id.toLowerCase().includes('.txt') || id.toLowerCase().includes('.md')) {
        const isMarkdown = id.toLowerCase().includes('.md');
        parsedData = await textParserRef.current.parse(buffer, id, id.split('_')[0], isMarkdown);
      } else {
        parsedData = await parserRef.current.parse(buffer, id);
      }
      
      // Cleanup any pre-existing book cover objects
      if (currentBook?.coverBlobUrl) {
        URL.revokeObjectURL(currentBook.coverBlobUrl);
      }

      setCurrentBook(parsedData);
      
      // Attempt to load associated progress indices
      const savedPlacement = await dbRef.current.getProgress(id);
      if (savedPlacement) {
        setCurrentSpineIndex(savedPlacement.currentSpineIndex);
        setCurrentPageIndex(savedPlacement.currentPageIndex);
      } else {
        setCurrentSpineIndex(0);
        setCurrentPageIndex(0);
      }

      setIsSidebarOpen(false);
      setStatusMessage(null);
    } catch (err: unknown) {
      setStatusMessage(`Unable to unlock book: ${(err as Error).message}`);
    }
  }, [currentBook]);

  // Delete book safely from IndexedDB and reset active frame if match
  const deleteStoredBook = useCallback(async (id: string) => {
    if (!dbRef.current) return;
    try {
      await dbRef.current.deleteBook(id);
      const list = await dbRef.current.listBooks();
      setSavedBooks(list);
      
      if (currentBook?.id === id) {
        setCurrentBook(null);
        setCurrentSpineIndex(0);
        setCurrentPageIndex(0);
      }
    } catch (err: unknown) {
      console.error('Delete book failed:', err);
    }
  }, [currentBook]);

  // Handle parsing newly uploaded files
  const processUploadedEpubFile = useCallback(async (file: File) => {
    if (!dbRef.current || !parserRef.current || !textParserRef.current) return;
    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.epub') && !nameLower.endsWith('.txt') && !nameLower.endsWith('.md')) {
      setStatusMessage('Direct file format mismatch. Please upload an EPUB, TXT, or MD document.');
      return;
    }

    setStatusMessage('Reading file buffer and saving offline...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uniqueBookId = `${file.name}_${Date.now()}`;
      
      // Save raw binary securely inside our IndexedDB sandbox
      await dbRef.current.saveBook(uniqueBookId, file.name.replace(/\.(epub|txt|md)$/gi, ''), arrayBuffer);
      
      // Refresh library list
      const list = await dbRef.current.listBooks();
      setSavedBooks(list);

      // Instantly open the newly added book
      let parsedData;
      if (nameLower.endsWith('.txt') || nameLower.endsWith('.md')) {
        const isMarkdown = nameLower.endsWith('.md');
        parsedData = await textParserRef.current.parse(arrayBuffer, uniqueBookId, file.name, isMarkdown);
      } else {
        parsedData = await parserRef.current.parse(arrayBuffer, uniqueBookId);
      }
      
      setCurrentBook(parsedData);
      setCurrentSpineIndex(0);
      setCurrentPageIndex(0);
      setStatusMessage(null);
    } catch (err: unknown) {
      console.error('Core parsing chain error:', err);
      setStatusMessage(`Ingestion failure: ${(err as Error).message}`);
    }
  }, []);

  // Table of Contents Jump trigger
  const jumpToTocLink = useCallback((href: string) => {
    if (!currentBook) return;

    // Separate target file from internal element reference hashes: OEBPS/xhtml/01.xhtml#subsect -> OEBPS/xhtml/01.xhtml and subsect
    const [cleanPath, targetHash] = href.split('#');
    
    // Locate corresponding spine item index reflecting the path
    const targetSpineIndex = currentBook.spine.findIndex(
      (spineItem) => {
        const item = currentBook.manifest[spineItem.idref];
        return item && item.href.toLowerCase().includes(cleanPath.toLowerCase());
      }
    );

    if (targetSpineIndex !== -1) {
      transitionDirectionRef.current = 'start';
      setCurrentSpineIndex(targetSpineIndex);
      setCurrentPageIndex(0); // For now start at beginning; if hash element jumping is implemented inside iframe, it will resolve.
      setIsSidebarOpen(false);
      persistReadingProgress(targetSpineIndex, 0);
    } else {
      console.warn('TOC link could not be located inside spine item catalog:', href);
    }
  }, [currentBook, persistReadingProgress]);

  // Turn page backward
  const handlePageTurnPrev = useCallback(() => {
    if (!currentBook) return;

    if (settings.paginated && currentPageIndex > 0) {
      const prevIndex = currentPageIndex - 1;
      setCurrentPageIndex(prevIndex);
      persistReadingProgress(currentSpineIndex, prevIndex);
    } else if (currentSpineIndex > 0) {
      // Move backwards to the previous spine item chapter, indicating we want to start at its end index
      transitionDirectionRef.current = 'end';
      const prevSpineIndex = currentSpineIndex - 1;
      setCurrentSpineIndex(prevSpineIndex);
      setCurrentPageIndex(0); // Temporary placeholder while geometry is compiled
      persistReadingProgress(prevSpineIndex, 0);
    }
  }, [currentBook, currentSpineIndex, currentPageIndex, settings.paginated, persistReadingProgress]);

  // Turn page forward
  const handlePageTurnNext = useCallback(() => {
    if (!currentBook) return;

    if (settings.paginated && currentPageIndex < totalPages - 1) {
      const nextIndex = currentPageIndex + 1;
      setCurrentPageIndex(nextIndex);
      persistReadingProgress(currentSpineIndex, nextIndex);
    } else if (currentSpineIndex < currentBook.spine.length - 1) {
      // Advance to the start of the next chapter spine element
      transitionDirectionRef.current = 'start';
      const nextSpineIndex = currentSpineIndex + 1;
      setCurrentSpineIndex(nextSpineIndex);
      setCurrentPageIndex(0);
      persistReadingProgress(nextSpineIndex, 0);
    }
  }, [currentBook, currentSpineIndex, currentPageIndex, totalPages, settings.paginated, persistReadingProgress]);

  // React on changes to iframe page dimensions to clamp values and handle backward jumps
  const handlePageCalculated = useCallback((pages: number) => {
    setTotalPages(pages);
    
    // If we transition back from a subsequent chapter, land on the very last column
    if (transitionDirectionRef.current === 'end' && pages > 1) {
      const targetLastIndex = pages - 1;
      setCurrentPageIndex(targetLastIndex);
      persistReadingProgress(currentSpineIndex, targetLastIndex);
    }
    // Reset transitional marks
    transitionDirectionRef.current = 'start';
  }, [currentSpineIndex, persistReadingProgress]);

  // Drag and Drop helpers for easy offline uploads
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedEpubFile(file);
    }
  }, [processUploadedEpubFile]);

  // Wire standard arrow keys for fluid reading convenience
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (isSidebarOpen || isSettingsOpen) return;
      
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handlePageTurnNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePageTurnPrev();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => {
      window.removeEventListener('keydown', handleKeys);
    };
  }, [isSidebarOpen, isSettingsOpen, handlePageTurnNext, handlePageTurnPrev]);

  // Theme color definitions translated for the host GUI
  const getHostThemeClasses = () => {
    return 'bg-[#0c0c0e] text-slate-300 dark';
  };

  return (
    <div 
      className={`h-[100dvh] max-h-[100dvh] w-full flex flex-col font-sans transition-colors duration-200 select-none overflow-hidden relative ${getHostThemeClasses()}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 1. STATUS BAR BANNER */}
      {statusMessage && (
        <div 
          className="bg-indigo-600 text-white text-xs py-1.5 px-4 flex items-center justify-between text-center select-text font-medium absolute top-0 left-0 right-0 z-50 animate-fade-in shadow-md border-b border-indigo-500/20"
          role="status"
        >
          <span className="flex-1 font-mono tracking-tight">{statusMessage}</span>
          <button 
            onClick={() => setStatusMessage(null)} 
            className="ml-3 hover:text-slate-200 select-none font-bold outline-none"
            aria-label="Close message"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. DRAG OVERLAY PORTAL */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-600/10 border-4 border-dashed border-indigo-500 rounded-lg m-3 z-50 pointer-events-none flex flex-col items-center justify-center backdrop-blur-xs">
          <Upload className="w-16 h-16 text-indigo-400 animate-bounce" />
          <h3 className="font-bold text-xl text-indigo-300 tracking-tight mt-4">Drop EPUB file here</h3>
          <p className="text-sm text-indigo-400 mt-1">Saves immediately to local sandboxed cache.</p>
        </div>
      )}

      {/* 3. DESKTOP/MOBILE PRIMARY HEADER BAR */}
      <header 
        className={`px-8 border-b border-white/5 flex items-center justify-between z-30 shrink-0 bg-[#16161a] text-slate-300 font-sans transition-all duration-300 ${
          isControlsVisible ? 'opacity-100 h-16' : 'opacity-0 h-0 overflow-hidden pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Open directory indexing drawer"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => setCurrentBook(null)}
            className="flex items-center gap-3 hover:opacity-90 focus:outline-none transition-all"
            title="Return to library catalog"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white shrink-0 shadow-sm shadow-indigo-505/20">
              <BookOpen className="w-4.5 h-4.5" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white uppercase font-sans hidden min-[400px]:inline">
              EPUBer
            </span>
          </button>

          {currentBook && (
            <div className="hidden sm:block h-6 w-[1px] bg-white/10 mx-3 md:mx-4" />
          )}

          {currentBook && (
            <div className="hidden sm:flex flex-col text-left max-w-[160px] md:max-w-xs select-text">
              <h1 className="text-xs md:text-sm font-medium text-slate-100 uppercase tracking-widest truncate">
                {currentBook.metadata.title}
              </h1>
              <span className="text-[10px] text-slate-500 uppercase truncate">
                {currentBook.metadata.creator || 'Unknown Author'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {currentBook && (
            <button
              onClick={() => setCurrentBook(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all text-xs text-slate-300 font-sans"
              title="Return to library catalog"
            >
              <Library className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Library</span>
            </button>
          )}

          <button
            onClick={() => setIsTranslateOpen(true)}
            className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            aria-label="Translate books"
            title="Translate books"
          >
            <Languages className="w-4.5 h-4.5" />
          </button>

          {currentBook && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/35 transition-all"
              aria-label="Modify reader theme and sizing"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>
          )}

          <label className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(99,102,241,0.25)] focus-within:ring-2 focus-within:ring-indigo-500/50">
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Add Book</span>
            <input 
              type="file" 
              accept=".epub,.txt,.md" 
              onChange={(e) => {
                const targetFile = e.target.files?.[0];
                if (targetFile) processUploadedEpubFile(targetFile);
              }} 
              className="sr-only" 
            />
          </label>
        </div>
      </header>

      {/* 4. ACTIVE WORKSPACE VIEW */}
      <main className="flex-1 overflow-hidden min-h-0 flex flex-col items-center justify-center relative bg-[#0c0c0e]">
        {currentBook ? (
          // IFRAME CHAPTER DISPLAYER STAGE
          <div className="w-full h-full flex items-center justify-between relative bg-[#0c0c0e]">
            
            {/* Horizontal Pagination Left Trigger */}
            {settings.paginated && (
              <button
                onClick={handlePageTurnPrev}
                className={`absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 transition-all duration-200 z-20 shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                aria-label="Previous page button"
              >
                <ChevronLeft className="w-5 h-5 text-slate-300" />
              </button>
            )}

            {/* Reading Frame Core Viewport */}
            <div className="flex-1 min-w-0 h-full relative">
              {currentChapter ? (
                <ReaderFrame
                  book={currentBook}
                  chapter={currentChapter}
                  settings={settings}
                  currentPageIndex={currentPageIndex}
                  onPageCountChange={handlePageCalculated}
                  onPageIndexChange={setCurrentPageIndex}
                  onPrevChapter={handlePageTurnPrev}
                  onNextChapter={handlePageTurnNext}
                  onCenterClick={() => setIsControlsVisible(!isControlsVisible)}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 font-mono text-center bg-[#0c0c0e]">
                  <span>Loading chapter segment...</span>
                </div>
              )}
            </div>

            {/* Horizontal Pagination Right Trigger */}
            {settings.paginated && (
              <button
                onClick={handlePageTurnNext}
                className={`absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-400 transition-all duration-200 z-20 shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                aria-label="Next page button"
              >
                <ChevronRight className="w-5 h-5 text-indigo-300" />
              </button>
            )}

          </div>
        ) : (
          // VISUAL LIBRARY DASHBOARD EMPTY STATE
          <div className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8 overflow-y-auto animate-fade-in bg-[#0c0c0e]">
            <div className="mb-8 pt-4">
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
                <BookOpen className="w-7 h-7 text-indigo-400" />
                EPUBer
              </h1>
              <p className="text-slate-400 mt-2 text-sm leading-relaxed max-w-xl">
                A high-performance, offline-first EPUB reader designed with fluid column pagination, customizable styling options, and sandboxed IndexedDB storage.
              </p>
            </div>

            {savedBooks.length === 0 ? (
              // Upload visual landing section
              <div 
                className="border border-dashed border-white/10 rounded-2xl bg-[#121216] p-12 text-center flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-[#16161a]/65 transition-all shadow-xl"
                onClick={() => {
                  const uploadInp = document.getElementById('book-landing-selector-upload') as HTMLInputElement;
                  if (uploadInp) uploadInp.click();
                }}
              >
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-4 rounded-full mb-4">
                  <Upload className="w-10 h-10 text-indigo-400" />
                </div>
                <h2 className="font-bold text-lg text-white tracking-tight">
                  Ingest your first book
                </h2>
                <p className="text-xs text-slate-400 max-w-[280px] mt-1.5 leading-relaxed">
                  Drag and drop a file or click to choose from your personal laptop filesystem.
                </p>
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 text-xs rounded-xl mt-5 shadow-[0_0_10px_rgba(99,102,241,0.25)] transition-all">
                  Open Files Explorer
                </button>
                <input 
                  type="file" 
                  id="book-landing-selector-upload"
                  accept=".epub,.txt,.md" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processUploadedEpubFile(file);
                  }} 
                  className="sr-only" 
                />
              </div>
            ) : (
              // Library Book Cards selection grid
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2 border-white/5">
                  <h2 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                    Your Saved Books Grid ({savedBooks.length})
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                  {savedBooks.map((book) => (
                    <div 
                      key={book.id}
                      className="group bg-[#121216] border border-white/5 rounded-2xl overflow-hidden shadow-xs hover:shadow-lg hover:border-indigo-500/30 transition-all h-[240px] flex flex-col justify-between cursor-pointer"
                      onClick={() => loadBook(book.id)}
                    >
                      {/* Stylized Book Cover Art Display Mock */}
                      <div className="flex-1 bg-[#16161a] flex items-center justify-center p-4 relative overflow-hidden group-hover:bg-[#1e1e24] transition-colors">
                        <div className="w-[84px] h-[116px] bg-[#0c0c0e] rounded-xs shadow-md border-l-3 border-l-indigo-600 flex flex-col justify-between p-2 text-left select-none relative overflow-hidden">
                          <span className="font-serif font-bold text-[8px] text-slate-100 tracking-tight leading-normal line-clamp-3">
                            {book.name}
                          </span>
                          <span className="text-[6px] font-mono font-semibold tracking-wider text-indigo-400 capitalize">
                            EPUB
                          </span>
                          {/* Design accents */}
                          <div className="absolute right-[-10px] bottom-[-10px] w-8 h-8 rounded-full bg-indigo-500/10" />
                        </div>
                      </div>

                      {/* Cover Details */}
                      <div className="p-3 bg-[#121216] border-t border-white/5">
                        <h3 className="font-semibold text-xs text-slate-200 group-hover:text-white truncate pr-1" title={book.name}>
                          {book.name}
                        </h3>
                        <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/5">
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(book.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteStoredBook(book.id);
                            }}
                            className="text-[10px] text-red-400 hover:text-red-300 hover:underline py-0.5 px-1 rounded hover:bg-red-500/10"
                            aria-label={`Safely remove ${book.name} from cache`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 5. CONTINUOUS / PAGE TURN READER FOOTER ACCENT BAR */}
      {currentBook && (
        <footer 
          className={`bg-[#16161a] border-t border-white/5 flex flex-col md:flex-row items-center px-8 gap-4 md:gap-12 z-30 select-none transition-all duration-300 ${
            isControlsVisible ? 'opacity-100 py-3 md:py-0 h-16 md:h-12' : 'opacity-0 h-0 overflow-hidden pointer-events-none'
          }`}
        >
          {/* Progress fill bar */}
          <div className="flex-1 w-full relative h-1 bg-slate-800 rounded-full">
            <div 
              style={{ width: `${Math.min(100, Math.max(1, Math.round(((currentSpineIndex) / currentBook.spine.length + (settings.paginated ? (currentPageIndex + 1) / (totalPages * currentBook.spine.length) : 0)) * 100)))}%` }}
              className="absolute left-0 top-0 h-full bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-350"
            />
          </div>

          {/* Reading analytics details */}
          <div className="flex items-center gap-6 md:gap-8 whitespace-nowrap text-xs">
            <div className="flex items-center gap-1.5 md:gap-2">
              <span className="text-slate-500 uppercase font-bold tracking-wider text-[10px]">Chapter Progress</span>
              <span className="text-indigo-400 font-bold">
                {settings.paginated ? Math.min(100, Math.round(((currentPageIndex + 1) / totalPages) * 100)) : 100}%
              </span>
            </div>

            <div className="flex items-center gap-1.5 md:gap-2">
              <span className="text-slate-500 uppercase font-bold tracking-wider text-[10px]">Time Left</span>
              <span className="text-indigo-400 font-bold">
                {Math.max(2, Math.ceil((currentBook.spine.length - currentSpineIndex - 1) * 3 + (settings.paginated ? (1 - (currentPageIndex + 1) / totalPages) * 3 : 0)))} min
              </span>
            </div>

            <div className="flex items-center gap-1.5 md:gap-2">
              <span className="text-slate-500 uppercase font-bold tracking-wider text-[10px]">Pages</span>
              <span className="text-slate-100 font-medium">
                {settings.paginated ? `${currentPageIndex + 1} / ${totalPages}` : `Chapter ${currentSpineIndex + 1} / ${currentBook.spine.length}`}
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* 6. TABLE OF CONTENTS DRAWER SIDEPANEL */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        savedBooks={savedBooks}
        currentBook={currentBook}
        onSelectBook={loadBook}
        onDeleteBook={deleteStoredBook}
        onChapterSelect={jumpToTocLink}
        currentChapterHref={currentChapter?.href}
      />

      {/* 7. VISUAL READER STYLINGS CONFIGURATION MODAL */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={updateSettings}
      />

      {/* 8. TRANSLATION MENU */}
      <TranslateMenu
        isOpen={isTranslateOpen}
        onClose={() => setIsTranslateOpen(false)}
        savedBooks={savedBooks}
      />
    </div>
  );
}
