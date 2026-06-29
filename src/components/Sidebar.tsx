/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Book, Trash2, HelpCircle, AlignLeft, ChevronRight, X } from 'lucide-react';
import { EpubParsedData, EpubTocItem } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  savedBooks: { id: string; name: string; addedAt: number }[];
  currentBook: EpubParsedData | null;
  onSelectBook: (id: string) => void;
  onDeleteBook: (id: string) => void;
  onChapterSelect: (href: string) => void;
  currentChapterHref?: string;
}

type TabType = 'library' | 'contents' | 'help';

export default function Sidebar({
  isOpen,
  onClose,
  savedBooks,
  currentBook,
  onSelectBook,
  onDeleteBook,
  onChapterSelect,
  currentChapterHref
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>(currentBook ? 'contents' : 'library');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredBooks = savedBooks.filter(book => 
    book.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Sidebar Backdrop Overlay */}
      <div 
        className="fixed inset-0 bg-black/45 z-40 transition-opacity md:backdrop-blur-xs" 
        onClick={onClose}
        role="presentation"
      />

      {/* Slide-out Sidebar Drawer container */}
      <aside 
        id="navigation-sidebar-drawer"
        role="dialog"
        aria-label="Navigation and library management"
        className="fixed left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-[#121216] border-r border-white/5 z-50 flex flex-col shadow-2xl h-full transition-transform duration-300 ease-out transform translate-x-0 text-slate-300"
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Book className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold text-lg tracking-tight text-white font-sans">EPUBer Index</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Tab Selectors */}
        <div className="flex bg-[#0c0c0e]/80 p-1 m-3 rounded-lg border border-white/5">
          <button
            onClick={() => setActiveTab('contents')}
            disabled={!currentBook}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus:ring-1 focus:ring-indigo-500 ${
              activeTab === 'contents' 
                ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20 font-bold shadow-xs' 
                : 'text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <AlignLeft className="w-3.5 h-3.5" />
            Chapters
          </button>
          
          <button
            onClick={() => setActiveTab('library')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus:ring-1 focus:ring-indigo-500 ${
              activeTab === 'library' 
                ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20 font-bold shadow-xs' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Book className="w-3.5 h-3.5" />
            Library
          </button>

          <button
            onClick={() => setActiveTab('help')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 focus-visible:outline-none focus:ring-1 focus:ring-indigo-500 ${
              activeTab === 'help' 
                ? 'bg-indigo-600/10 text-indigo-300 border border-indigo-500/20 font-bold shadow-xs' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Guides
          </button>
        </div>

        {/* Panel Main Scrolling Contents */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 min-h-0">
          
          {/* TAB: CHAPTERS CONTENTS (Table of Contents) */}
          {activeTab === 'contents' && currentBook && (
            <div className="space-y-2 py-1 animate-fade-in">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                Active Book Index
              </div>
              <ul className="space-y-1" role="list">
                {currentBook.toc.map((chapterItem: EpubTocItem, index) => {
                  const isActive = currentChapterHref && chapterItem.href.toLowerCase().includes(currentChapterHref.split('#')[0].toLowerCase());
                  
                  return (
                    <li key={index}>
                      <button
                        onClick={() => onChapterSelect(chapterItem.href)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg flex items-start gap-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 group ${
                          isActive 
                            ? 'bg-indigo-600/10 text-indigo-300 font-semibold border-l-2 border-indigo-500 pl-2' 
                            : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 transition-transform ${isActive ? 'text-indigo-400 transform translate-x-0.5' : 'text-slate-500 group-hover:translate-x-0.5'}`} />
                        <span className="truncate pr-1">{chapterItem.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* TAB: LIBRARY BOOKS */}
          {activeTab === 'library' && (
            <div className="space-y-4 py-1 animate-fade-in flex flex-col h-full">
              {/* Search input field */}
              <div className="space-y-1 shrink-0">
                <label htmlFor="search-books" className="sr-only">Search loaded books</label>
                <input
                  type="text"
                  id="search-books"
                  placeholder="Find in book..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#16161a] border border-white/10 rounded-lg px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-500 transition-colors"
                />
              </div>

              {/* Books List Scroller */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {filteredBooks.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No books found. Ingest one to start reading!
                  </div>
                ) : (
                  <ul className="space-y-2 pr-1" role="list">
                    {filteredBooks.map((book) => {
                      const isCurrent = currentBook?.id === book.id;
                      return (
                        <li 
                          key={book.id} 
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2.5 group transition-all ${
                            isCurrent 
                              ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-300 shadow-xs' 
                              : 'bg-[#16161a] hover:bg-white/5 border-white/5 hover:border-white/10'
                          }`}
                        >
                          <button
                            onClick={() => onSelectBook(book.id)}
                            className="flex-1 text-left min-w-0 font-medium text-xs rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                            title={`Read ${book.name}`}
                          >
                            <div className="font-semibold truncate flex items-center gap-1.5 text-slate-200">
                              {book.name}
                              {isCurrent && (
                                <span className="bg-indigo-600 text-white text-[9px] scale-90 px-1 py-0.2 rounded font-bold uppercase select-none">
                                  Reading
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1">
                              Added {new Date(book.addedAt).toLocaleDateString()}
                            </div>
                          </button>
                          
                          <button
                            onClick={() => onDeleteBook(book.id)}
                            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-950/20 transition-colors opacity-80 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
                            aria-label={`Delete ${book.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* TAB: KEYBOARD GUIDES HELP */}
          {activeTab === 'help' && (
            <div className="space-y-4 py-1 text-xs text-slate-400 animate-fade-in">
              <div className="bg-indigo-600/10 p-3 rounded-lg border border-indigo-500/20 space-y-1">
                <div className="font-semibold text-indigo-300 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" /> Quick Guide
                </div>
                <p className="leading-relaxed">This EPUBer runs completely inside your browser locally utilizing native HTML5. Your books are stored inside your sandbox IndexedDB, meaning they never touch a cloud and work 100% offline!</p>
              </div>

              <div className="space-y-2">
                <span className="font-semibold text-slate-200">Keyboard Controls</span>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 pt-1">
                  <kbd className="px-1.5 py-0.5 border border-white/10 bg-[#16161a] rounded font-mono text-[10px] text-center text-slate-300 shadow-xs">ArrowRight</kbd>
                  <span>Advance one page (paginated mode)</span>
                  
                  <kbd className="px-1.5 py-0.5 border border-white/10 bg-[#16161a] rounded font-mono text-[10px] text-center text-slate-300 shadow-xs">Spacebar</kbd>
                  <span>Advance page / Scroll page down</span>

                  <kbd className="px-1.5 py-0.5 border border-white/10 bg-[#16161a] rounded font-mono text-[10px] text-center text-slate-300 shadow-xs">ArrowLeft</kbd>
                  <span>Go back one page</span>

                  <kbd className="px-1.5 py-0.5 border border-white/10 bg-[#16161a] rounded font-mono text-[10px] text-center text-slate-300 shadow-xs">Escape</kbd>
                  <span>Dismiss sidebar or close settings</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <span className="font-semibold text-slate-200 block">Mobile & Gesture Controls</span>
                <p className="leading-relaxed text-[11px]">In horizontal paginated mode, tap on the **left 22%** or **swipe left** to flip back, tap on the **right 22%** or **swipe right** to advance, and tap in the **center region** to prompt the visual drawer controls overlay!</p>
              </div>
            </div>
          )}

        </div>
      </aside>
    </>
  );
}
