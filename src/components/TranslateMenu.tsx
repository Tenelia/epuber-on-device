import { useState, useEffect } from 'react';
import { X, Languages, Key, Settings2, FileText, Loader2, Download, FileJson, Cpu } from 'lucide-react';
import { LibraryDb } from '../lib/libraryDb';
import { EpubParser } from '../lib/epubParser';
import { TextParser } from '../lib/textParser';
import { HardwareDetector, HardwareCapabilities } from '../lib/hardware';

interface TranslateMenuProps {
  isOpen: boolean;
  onClose: () => void;
  savedBooks: { id: string; name: string }[];
}

export default function TranslateMenu({ isOpen, onClose, savedBooks }: TranslateMenuProps) {
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'cerebras' | 'on-device'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<'txt' | 'md'>('txt');
  const [systemPrompt, setSystemPrompt] = useState(`You are a professional literary translator. You must first carefully parse and understand the context, tone, and narrative of the provided book excerpt BEFORE attempting to translate. Maintain the author's voice, formatting, and structural integrity. Translate the following text into {targetLanguage}. Return ONLY the translated text without any conversational preamble or explanations.`);
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [webllmProgress, setWebllmProgress] = useState('');
  const [localModel, setLocalModel] = useState('gemma-2b-it-q4f16_1-MLC');
  const [customModelPath, setCustomModelPath] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hardware, setHardware] = useState<HardwareCapabilities | null>(null);

  useEffect(() => {
    HardwareDetector.detect().then(setHardware);
  }, []);

  useEffect(() => {
    const savedKeys = localStorage.getItem('epub_api_keys');
    if (savedKeys) {
      const keys = JSON.parse(savedKeys);
      setApiKey(keys[provider] || '');
    }
  }, [provider]);

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    const savedKeys = JSON.parse(localStorage.getItem('epub_api_keys') || '{}');
    savedKeys[provider] = val;
    localStorage.setItem('epub_api_keys', JSON.stringify(savedKeys));
  };

  const handleTranslate = async () => {
    if (provider !== 'on-device' && !apiKey) {
      setError('Please enter your API key.');
      return;
    }
    if (!selectedBookId) {
      setError('Please select a book to translate.');
      return;
    }
    setError(null);
    setIsTranslating(true);
    setProgress(0);
    setWebllmProgress('');
    setTranslatedText('');

    try {
      const db = new LibraryDb();
      await db.init();
      const buffer = await db.getBook(selectedBookId);
      if (!buffer) throw new Error('Book not found in local storage.');

      let parsed;
      if (selectedBookId.toLowerCase().includes('.txt') || selectedBookId.toLowerCase().includes('.md')) {
        const textParser = new TextParser();
        const isMarkdown = selectedBookId.toLowerCase().includes('.md');
        parsed = await textParser.parse(buffer, selectedBookId, selectedBookId.split('_')[0], isMarkdown);
      } else {
        const parser = new EpubParser();
        parsed = await parser.parse(buffer, selectedBookId);
      }

      let engine: any = null;
      if (provider === 'on-device') {
        const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
        setWebllmProgress('Initializing WebGPU Engine...');
        
        let appConfig = undefined;
        if (localModel === 'custom' && customModelPath) {
          appConfig = {
            model_list: [
              {
                model_id: "custom-local-model",
                model_lib: "webgpu", // placeholder
                model: customModelPath,
              }
            ]
          };
        }

        const modelToLoad = localModel === 'custom' ? 'custom-local-model' : localModel;
        engine = await CreateMLCEngine(modelToLoad, {
          initProgressCallback: (info) => {
            setWebllmProgress(`WebLLM: ${info.text}`);
          },
          appConfig,
        });
      }

      let fullTranslated = '';
      const totalChapters = parsed.spine.length;

      for (let i = 0; i < totalChapters; i++) {
        const spineRef = parsed.spine[i];
        const manifestItem = parsed.manifest[spineRef.idref];
        const asset = parsed.assets[manifestItem.href];
        
        if (asset) {
          const content = new TextDecoder('utf-8').decode(asset.data);
          const textContent = content.replace(/<[^>]*>?/gm, ' ').trim();
          
          if (textContent.length > 50) { // Only translate meaningful chapters
            let chapterTranslated = '';
            
            // Dynamic Moving Window Logic based on Hardware Tier Context Limits
            const chunkSize = hardware?.recommendedChunkSize || 1000;
            const overlap = Math.floor(chunkSize * 0.1); // 10% overlap context
            let currentIdx = 0;
            
            while (currentIdx < textContent.length) {
              const chunk = textContent.substring(currentIdx, currentIdx + chunkSize);
              let chunkTranslated = '';
              
              if (provider === 'on-device' && engine) {
                setWebllmProgress(`Translating Chapter ${i + 1}/${totalChapters} (${Math.round((currentIdx / textContent.length) * 100)}%). Generating...`);
                const res = await engine.chat.completions.create({
                  messages: [
                    { role: 'system', content: systemPrompt.replace('{targetLanguage}', targetLanguage) },
                    { role: 'user', content: chunk }
                  ]
                });
                chunkTranslated = res.choices[0]?.message?.content || '';
              } else {
                const res = await fetch('/api/translate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    provider,
                    apiKey,
                    model: provider === 'cerebras' ? 'llama3.1-70b' : undefined,
                    targetLanguage,
                    systemPrompt: systemPrompt.replace('{targetLanguage}', targetLanguage),
                    content: chunk
                  })
                });

                if (!res.ok) {
                  const errorData = await res.json();
                  throw new Error(errorData.error || 'Translation API request failed');
                }

                const data = await res.json();
                chunkTranslated = data.translatedText;
              }
              
              chapterTranslated += chunkTranslated + ' ';
              currentIdx += (chunkSize - overlap);
              
              // Yield to main thread for UI updates during intense loops
              await new Promise(r => setTimeout(r, 10));
            }

            const prefix = outputFormat === 'md' ? `\n\n## Chapter ${i + 1}\n\n` : `\n\n--- Chapter ${i + 1} ---\n\n`;
            fullTranslated += prefix + chapterTranslated.trim();
          }
        }
        
        setProgress(Math.round(((i + 1) / totalChapters) * 100));
      }

      setTranslatedText(fullTranslated);
    } catch (err: any) {
      setError(err.message || 'An error occurred during translation.');
    } finally {
      setIsTranslating(false);
      setWebllmProgress('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-[#121216] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#16161a]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Languages className="w-5 h-5 text-indigo-400" />
            AI Translation
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 text-slate-300 text-sm space-y-6">
          
          {hardware && (
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 flex flex-col gap-1.5 text-[10px] text-slate-400 font-mono">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <Cpu className="w-3.5 h-3.5" /> Hardware Profile Detected
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div><span className="text-slate-500">Tier:</span> <span className={hardware.computeTier === 'NPU' || hardware.computeTier === 'GPU' ? 'text-emerald-400' : 'text-amber-400'}>{hardware.computeTier}</span></div>
                <div><span className="text-slate-500">NPU (WebNN):</span> {hardware.hasNPU ? 'Available' : 'None'}</div>
                <div><span className="text-slate-500">GPU (WebGPU):</span> {hardware.hasWebGPU ? 'Available' : hardware.hasWebGL ? 'WebGL Fallback' : 'None'}</div>
                <div><span className="text-slate-500">Moving Window:</span> {hardware.recommendedChunkSize} chars</div>
              </div>
            </div>
          )}

          {/* Provider Selection */}
          <div className="space-y-3">
            <label className="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" /> AI Provider
            </label>
            <div className="grid grid-cols-4 gap-3">
              {['openai', 'anthropic', 'cerebras', 'on-device'].map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p as any)}
                  className={`py-2 px-3 rounded-xl border ${provider === p ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold' : 'bg-white/5 border-white/10 hover:bg-white/10'} transition-all capitalize text-xs whitespace-nowrap`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* API Key or Local Model Options */}
          {provider !== 'on-device' ? (
            <div className="space-y-3">
              <label className="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> API Key ({provider})
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={`Enter your ${provider} API key...`}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono text-sm"
              />
              <p className="text-[10px] text-slate-500">Keys are stored locally on your device in localStorage.</p>
            </div>
          ) : (
            <div className="space-y-4 bg-indigo-950/20 border border-indigo-500/30 p-4 rounded-xl">
              <div className="space-y-3">
                <label className="font-semibold text-indigo-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" /> WebGPU Model Selection (No Internet Required)
                </label>
                <select
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 appearance-none"
                >
                  <option value="gemma-2b-it-q4f16_1-MLC">Gemma 2B (Q4)</option>
                  <option value="Qwen2-1.5B-Instruct-q4f16_1-MLC">Qwen 1.5B (Q4)</option>
                  <option value="custom">Custom Filepath</option>
                </select>
                <p className="text-[10px] text-indigo-200/60 leading-relaxed">
                  These models run locally inside your browser via WebGPU using Google Deepmind / MLC WebLLM technologies. The model will download on first run.
                </p>
              </div>
              
              {localModel === 'custom' && (
                <div className="space-y-3 pt-2 border-t border-indigo-500/20">
                  <label className="font-semibold text-indigo-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Custom Model URL/Path
                  </label>
                  <input
                    type="text"
                    value={customModelPath}
                    onChange={(e) => setCustomModelPath(e.target.value)}
                    placeholder="e.g., http://localhost:8000/my-model/"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-all font-mono text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {/* Book and Language Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Select Book
              </label>
              <select
                value={selectedBookId}
                onChange={(e) => setSelectedBookId(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 appearance-none"
              >
                <option value="" disabled>Choose a book...</option>
                {savedBooks.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-3">
              <label className="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5" /> Target Language
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 appearance-none"
              >
                {['Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Korean', 'Italian', 'Russian'].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5" /> Output Format
              </label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as 'txt' | 'md')}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 appearance-none"
              >
                <option value="txt">Plain Text (.txt)</option>
                <option value="md">Markdown (.md)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" /> System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono text-xs min-h-[100px]"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-mono">
              {error}
            </div>
          )}

          {isTranslating && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-indigo-300 font-bold">
                  <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Translating...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
              
              {provider === 'on-device' && webllmProgress && (
                <div className="bg-indigo-950/40 border border-indigo-500/20 p-3 rounded-xl">
                  <div className="text-[10px] text-indigo-300/80 font-mono flex items-start gap-2">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0 mt-0.5" />
                    <span className="break-all">{webllmProgress}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {translatedText && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-200 uppercase tracking-wider text-[10px]">Translation Output</label>
                <button
                  onClick={() => {
                    const blob = new Blob([translatedText], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `translated_book.${outputFormat}`;
                    a.click();
                  }}
                  className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 text-white px-2 py-1 rounded border border-white/10 transition-colors"
                >
                  <Download className="w-3 h-3" /> Download .{outputFormat}
                </button>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-xl p-4 max-h-64 overflow-y-auto font-serif text-sm leading-relaxed whitespace-pre-wrap">
                {translatedText}
              </div>
            </div>
          )}

        </div>

        <div className="p-5 border-t border-white/10 bg-[#16161a] flex justify-end">
          <button
            onClick={handleTranslate}
            disabled={isTranslating}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-xl transition-all shadow-[0_0_10px_rgba(99,102,241,0.25)]"
          >
            Start Translation
          </button>
        </div>
      </div>
    </div>
  );
}
