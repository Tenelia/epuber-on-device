/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChangeEvent } from 'react';
import { X, Type, LayoutGrid, Sun } from 'lucide-react';
import { ReaderSettings, ReaderTheme } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (updater: (prev: ReaderSettings) => ReaderSettings) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}: SettingsModalProps) {
  if (!isOpen) return null;

  const handleThemeChange = (theme: ReaderTheme) => {
    onUpdateSettings((prev) => ({ ...prev, theme }));
  };

  const handleFontFamilyChange = (fontFamily: string) => {
    onUpdateSettings((prev) => ({ ...prev, fontFamily }));
  };

  const handleFontSizeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const fontSize = parseInt(e.target.value, 10);
    onUpdateSettings((prev) => ({ ...prev, fontSize }));
  };

  const handleLineHeightChange = (lineHeight: number) => {
    onUpdateSettings((prev) => ({ ...prev, lineHeight }));
  };

  const handleLayoutModeChange = (paginated: boolean) => {
    onUpdateSettings((prev) => ({ ...prev, paginated }));
  };

  const handleDoublePageToggle = (doublePage: boolean) => {
    onUpdateSettings((prev) => ({ ...prev, doublePage }));
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs" 
        onClick={onClose}
        role="presentation"
      />

      {/* Settings Modal Container */}
      <div
        id="settings-dialog-container"
        role="dialog"
        aria-labelledby="reading-settings-title"
        className="fixed right-4 bottom-4 md:right-8 md:top-20 md:bottom-auto w-[360px] max-w-[90vw] bg-[#121216] border border-white/5 rounded-2xl shadow-2xl z-50 flex flex-col focus:outline-none text-slate-300 transform translate-y-0 transition-all duration-200 ease-out animate-fade-in"
      >
        {/* Settings Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Type className="w-4.5 h-4.5 text-indigo-400" />
            <h3 id="reading-settings-title" className="font-semibold text-sm tracking-tight text-white font-sans">
              Type & Theme Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-slate-450 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Dismiss settings modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Body content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[80vh] shrink">
          
          {/* SECTION 1: VISUAL VIEW THEMES */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Display Theme
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'light', name: 'Light', bg: 'bg-[#FAF9F6]', text: 'text-[#212529]' },
                { id: 'sepia', name: 'Sepia', bg: 'bg-[#F4ECD8]', text: 'text-[#433422]' },
                { id: 'dark', name: 'Dark', bg: 'bg-[#0c0c0e]', text: 'text-[#E2E8F0]' },
                { id: 'contrast', name: 'Hi-Con', bg: 'bg-[#000000]', text: 'text-[#FFFFFF]' }
              ].map((item) => {
                const isActive = settings.theme === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleThemeChange(item.id as ReaderTheme)}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-lg border-2 text-[10px] font-semibold transition-all shadow-2xs relative ${item.bg} ${item.text} ${
                      isActive 
                        ? 'border-indigo-500 scale-[1.03] ring-1 ring-indigo-550/40' 
                        : 'border-transparent opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span>{item.name}</span>
                    {isActive && (
                      <span className="absolute bottom-1 w-1 h-1 bg-indigo-500 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: FONTS FAMILY */}
          <div className="space-y-1.5">
            <label htmlFor="settings-font-family" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Font Family
            </label>
            <select
              id="settings-font-family"
              value={settings.fontFamily}
              onChange={(e) => handleFontFamilyChange(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[#16161a] border border-white/10 rounded-lg text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 cursor-pointer"
            >
              <option value="sans-serif">System Sans-Serif</option>
              <option value="serif">Classic Book Serif (Georgia)</option>
              <option value="monospace">Technical Mono (JetBrains Code)</option>
              <option value="opendyslexic">OpenDyslexic (Dyslexia Aid)</option>
            </select>
          </div>

          {/* SECTION 3: FONT SIZE CONTROLS */}
          <div className="space-y-1.5 bg-[#16161a] p-3 rounded-lg border border-white/5">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <span>Text Scale</span>
              <span className="font-mono text-xs text-indigo-400 font-bold">{settings.fontSize}%</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">A-</span>
              <input
                type="range"
                min="80"
                max="220"
                step="10"
                value={settings.fontSize}
                onChange={handleFontSizeChange}
                className="flex-1 accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                aria-label="Adjust typography sizing slider scale"
              />
              <span className="text-sm text-slate-500 font-semibold uppercase">A+</span>
            </div>
          </div>

          {/* SECTION 4: LINE SPACING HEIGHTS */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Line Spacing
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[1.3, 1.5, 1.7, 1.9].map((val) => {
                const isActive = settings.lineHeight === val;
                return (
                  <button
                    key={val}
                    onClick={() => handleLineHeightChange(val)}
                    className={`py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-xs ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-[#16161a] text-slate-400 border-white/5 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {val.toFixed(1)}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 5: LAYOUT DESIGN (COLUMNS VS SCROLL) */}
          <div className="space-y-1.5 border-t border-white/5 pt-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
              Navigation Mode
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleLayoutModeChange(true)}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-[11px] font-semibold transition-all ${
                  settings.paginated
                    ? 'bg-indigo-600/10 text-indigo-300 border-indigo-500/20 shadow-3xs'
                    : 'bg-[#16161a] text-slate-400 border-white/5 hover:bg-white/5 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-4.5 h-4.5 mb-1 text-slate-400 shrink-0" />
                <span>Columns Pagination</span>
              </button>

              <button
                onClick={() => handleLayoutModeChange(false)}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-[11px] font-semibold transition-all ${
                  !settings.paginated
                    ? 'bg-indigo-600/10 text-indigo-300 border-indigo-500/20 shadow-3xs'
                    : 'bg-[#16161a] text-slate-400 border-white/5 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Sun className="w-4.5 h-4.5 mb-1 text-slate-400 shrink-0 rotate-180" />
                <span>Continuous Scroll</span>
              </button>
            </div>
          </div>

          {/* OPTION: SINGLE VS DOUBLE PAGE FOR PAGINATED LAYOUTS */}
          {settings.paginated && (
            <div className="flex items-center justify-between py-1.5 border-t border-white/5 pt-3.5">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                  Double Page Mode
                </span>
                <span className="text-[10px] text-slate-500 max-w-[200px]">
                  Requires wide viewport display screens
                </span>
              </div>
              <button
                role="switch"
                aria-checked={settings.doublePage}
                onClick={() => handleDoublePageToggle(!settings.doublePage)}
                className={`w-10 h-5.5 rounded-full relative transition-colors focus-visible:outline-none focus:ring-1 focus:ring-indigo-500 ${
                  settings.doublePage ? 'bg-indigo-600' : 'bg-slate-800'
                }`}
                aria-label="Toggle side by side double page view columns"
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white absolute top-0.75 left-0.75 transition-transform ${
                    settings.doublePage ? 'transform translate-x-[18px]' : 'transform translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
