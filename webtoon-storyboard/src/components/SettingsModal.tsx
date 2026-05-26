import { useState, useEffect } from 'react';
import { X, Key, LayoutTemplate, Palette, RefreshCw, CheckCircle2, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { AppSettings } from '../types';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useAppStore();
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({ ...prev, [name]: value }));
  };

  const fetchOllamaModels = async () => {
    setIsFetchingModels(true);
    try {
      const url = (localSettings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const response = await fetch(`${url}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        setOllamaModels(models);
        
        // 브라우저 화면(Select)에는 첫 번째 항목이 보이는데 실제 State는 기존 값인 현상 방지
        if (models.length > 0 && !models.includes(localSettings.ollamaModel)) {
          setLocalSettings(prev => ({ ...prev, ollamaModel: models[0] }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSave = () => {
    updateSettings(localSettings);
    setSaveStatus('saved');
    setTimeout(() => {
      setSaveStatus('idle');
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">설정 (Settings)</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* AI Provider Section */}
          <div className="space-y-3 pb-4 border-b border-slate-100 dark:border-slate-700">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 block">AI 서비스 선택 (LLM Provider)</label>
            <div className="grid grid-cols-2 gap-3">
              {['gemini', 'ollama'].map((p) => (
                <button
                  key={p}
                  onClick={() => setLocalSettings(prev => ({ ...prev, aiProvider: p as any }))}
                  className={`p-3 rounded-xl border-2 transition-all font-bold capitalize ${
                    localSettings.aiProvider === p ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-100 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {localSettings.aiProvider === 'gemini' && (
              <div className="mt-4 space-y-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 animate-in slide-in-from-top-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Key className="w-3 h-3" /> Gemini API Key
                  </label>
                  <input 
                    type="password"
                    name="apiKey"
                    value={localSettings.apiKey}
                    onChange={handleChange}
                    placeholder="AIZA..."
                    className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Gemini Model</label>
                  <input 
                    name="aiModel"
                    value={localSettings.aiModel}
                    onChange={handleChange}
                    placeholder="gemini-2.5-flash"
                    className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>
            )}

            {localSettings.aiProvider === 'ollama' && (
              <div className="mt-4 space-y-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 animate-in slide-in-from-top-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Ollama URL</label>
                  <input 
                    name="ollamaUrl"
                    value={localSettings.ollamaUrl}
                    onChange={handleChange}
                    placeholder="http://localhost:11434"
                    className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between">
                    Ollama Model
                    <button 
                      onClick={fetchOllamaModels}
                      disabled={isFetchingModels}
                      className="text-primary-600 hover:underline flex items-center gap-1"
                    >
                      {isFetchingModels ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                      불러오기
                    </button>
                  </label>
                  {ollamaModels.length > 0 ? (
                    <select 
                      name="ollamaModel"
                      value={localSettings.ollamaModel}
                      onChange={handleChange}
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
                    >
                      {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input 
                      name="ollamaModel"
                      value={localSettings.ollamaModel}
                      onChange={handleChange}
                      placeholder="llama3"
                      className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ComfyUI Settings Section */}
          <div className="space-y-3 pb-4 border-b border-slate-100 dark:border-slate-700">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary-500" /> ComfyUI 엔진 설정
            </label>
            <input 
              name="comfyUrl"
              value={localSettings.comfyUrl}
              onChange={handleChange}
              placeholder="http://localhost:8188"
              className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-transparent text-sm mb-2"
            />
            <div className="space-y-1 mt-2 mb-4">
              <label className="text-[10px] font-bold text-slate-500 uppercase">생성 모델 (UNET Model)</label>
              <input 
                name="comfyModel"
                value={localSettings.comfyModel || ''}
                onChange={handleChange}
                placeholder="z-anime-distill-8step-fp8.safetensors"
                className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-transparent text-sm"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">기본 시드값 (Default Seed)</label>
                <input 
                  type="number"
                  name="defaultSeed"
                  value={localSettings.defaultSeed}
                  onChange={handleChange}
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-transparent text-sm"
                />
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input 
                  type="checkbox"
                  id="useUpscale"
                  checked={localSettings.useUpscale}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, useUpscale: e.target.checked }))}
                  className="w-4 h-4 rounded text-primary-600"
                />
                <label htmlFor="useUpscale" className="text-xs text-slate-600 dark:text-slate-400 font-medium">업스케일(1.5x) 사용</label>
              </div>
            </div>
          </div>

          {/* Aspect Ratio Section */}
          <div className="space-y-3 pb-4 border-b border-slate-100 dark:border-slate-700">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 block">화면 비율 (Aspect Ratio)</label>
            <div className="grid grid-cols-3 gap-2">
              {['9:16', '3:4', '16:9'].map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setLocalSettings(prev => ({ ...prev, aspectRatio: ratio as any }))}
                  className={`py-2 rounded-lg border text-xs font-bold ${
                    localSettings.aspectRatio === ratio ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Other Settings (Style Guide, etc.) */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Palette className="w-4 h-4 text-amber-500" /> 스타일 가이드
              </label>
              <textarea name="styleGuide" value={localSettings.styleGuide} onChange={handleChange} rows={2} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4 text-emerald-500" /> 품질 태그 (Quality Tags)
              </label>
              <textarea name="qualityTags" value={localSettings.qualityTags} onChange={handleChange} rows={2} className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-mono" />
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/80">
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-slate-600">취소</button>
          <button onClick={handleSave} className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-all">
            {saveStatus === 'saved' ? '저장됨!' : '설정 저장하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
