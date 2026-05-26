import { useState } from 'react';
import { Users, MapPin, Package, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { CharacterItem, LocationItem, ObjectItem } from '../types';

type TabType = 'characters' | 'locations' | 'objects';

export default function SeriesBibleTab() {
  const [activeTab, setActiveTab] = useState<TabType>('characters');
  const store = useAppStore();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Sub-tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 pt-2 gap-2">
        <TabButton id="characters" current={activeTab} set={setActiveTab} label="Characters" icon={<Users className="w-4 h-4" />} />
        <TabButton id="locations" current={activeTab} set={setActiveTab} label="Locations" icon={<MapPin className="w-4 h-4" />} />
        <TabButton id="objects" current={activeTab} set={setActiveTab} label="Objects" icon={<Package className="w-4 h-4" />} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                {activeTab}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                스토리보드의 프롬프트 일관성을 유지하기 위해 등장인물, 장소, 소품을 설정하세요.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Form for new items */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm h-fit sticky top-0">
              <h3 className="font-bold flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-200">
                <Plus className="w-4 h-4" /> Add New
              </h3>
              {activeTab === 'characters' && <CharacterForm />}
              {activeTab === 'locations' && <LocationForm />}
              {activeTab === 'objects' && <ObjectForm />}
            </div>

            {/* List of existing items */}
            <div className="space-y-3">
              {activeTab === 'characters' && store.characters.map((item) => (
                <CharacterCard key={item.id} item={item} />
              ))}
              {activeTab === 'locations' && store.locations.map((item) => (
                <LocationCard key={item.id} item={item} />
              ))}
              {activeTab === 'objects' && store.objects.map((item) => (
                <ObjectCard key={item.id} item={item} />
              ))}
              
              {/* Empty states */}
              {activeTab === 'characters' && store.characters.length === 0 && <EmptyState name="characters" />}
              {activeTab === 'locations' && store.locations.length === 0 && <EmptyState name="locations" />}
              {activeTab === 'objects' && store.objects.length === 0 && <EmptyState name="objects" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ id, current, set, label, icon }: { id: TabType, current: TabType, set: (id: TabType) => void, label: string, icon: React.ReactNode }) {
  const active = current === id;
  return (
    <button
      onClick={() => set(id)}
      className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all focus:outline-none ${
        active 
          ? 'border-primary-500 text-primary-600 dark:text-primary-400' 
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ------ Empty State ------
function EmptyState({ name }: { name: string }) {
  return (
    <div className="text-center p-8 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
      <p className="text-slate-500 dark:text-slate-400 text-sm">등록된 {name} 항목이 없습니다.</p>
    </div>
  );
}

// ------ Character Components ------
function CharacterForm() {
  const { addCharacter } = useAppStore();
  const [name, setName] = useState('');
  const [appearance, setAppearance] = useState('');
  const [loraTrigger, setLoraTrigger] = useState('');
  const [loraPath, setLoraPath] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    addCharacter({ name, appearance, loraTrigger, loraPath });
    setName('');
    setAppearance('');
    setLoraTrigger('');
    setLoraPath('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in">
      <div>
         <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Name</label>
         <input required value={name} onChange={e => setName(e.target.value)} className="w-full text-sm p-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500" placeholder="e.g. 주인공 (John)" />
      </div>
      <div>
         <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Appearance & Clothing</label>
         <textarea required value={appearance} onChange={e => setAppearance(e.target.value)} rows={3} className="w-full text-sm p-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500" placeholder="e.g. 흑발, 붉은 눈, 검은 수트 (black hair, red eyes, holding a sword)" />
      </div>
      <div>
         <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">LoRA Trigger Word</label>
         <input value={loraTrigger} onChange={e => setLoraTrigger(e.target.value)} className="w-full text-sm p-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500" placeholder="e.g. ch_john_v1" />
      </div>
      <div>
         <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">LoRA File Path (.safetensors)</label>
         <input value={loraPath} onChange={e => setLoraPath(e.target.value)} className="w-full text-sm p-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500" placeholder="e.g. 로라\hero_v1.safetensors" />
      </div>
      <button type="submit" className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm font-bold transition-colors">
        추가하기
      </button>
    </form>
  );
}

function CharacterCard({ item }: { item: CharacterItem }) {
  const { deleteCharacter } = useAppStore();
  return (
    <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm group">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-primary-700 dark:text-primary-400 text-lg">{item.name}</h4>
        <button onClick={() => deleteCharacter(item.id)} className="text-slate-400 hover:text-red-500 transition-colors hidden group-hover:block"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-slate-700 dark:text-slate-300"><span className="font-semibold text-xs text-slate-500 mr-2 uppercase">Appr:</span> {item.appearance}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {item.loraTrigger && <p className="text-slate-700 dark:text-slate-300"><span className="font-semibold text-xs text-slate-500 mr-2 uppercase">Trigger:</span> <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded text-[11px]">{item.loraTrigger}</code></p>}
          {item.loraPath && <p className="text-slate-700 dark:text-slate-300"><span className="font-semibold text-xs text-slate-500 mr-2 uppercase">File:</span> <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded text-[11px]">{item.loraPath}</code></p>}
        </div>
      </div>
    </div>
  );
}

// ------ Location Components ------
function LocationForm() {
  const { addLocation } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    addLocation({ name, description });
    setName('');
    setDescription('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in">
      <div>
         <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Location Name</label>
         <input required value={name} onChange={e => setName(e.target.value)} className="w-full text-sm p-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500" placeholder="e.g. 마왕성" />
      </div>
      <div>
         <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Description (English Details Recommended)</label>
         <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4} className="w-full text-sm p-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500" placeholder="e.g. dark and gloomy castle, gothic architecture, red torches" />
      </div>
      <button type="submit" className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm font-bold transition-colors">
        추가하기
      </button>
    </form>
  );
}

function LocationCard({ item }: { item: LocationItem }) {
  const { deleteLocation } = useAppStore();
  return (
    <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm group">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-emerald-700 dark:text-emerald-500 text-lg flex items-center gap-1.5"><MapPin className="w-4 h-4"/>{item.name}</h4>
        <button onClick={() => deleteLocation(item.id)} className="text-slate-400 hover:text-red-500 transition-colors hidden group-hover:block"><Trash2 className="w-4 h-4" /></button>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300">{item.description}</p>
    </div>
  );
}

// ------ Object Components ------
function ObjectForm() {
  const { addObject } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    addObject({ name, description });
    setName('');
    setDescription('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in">
       <div>
         <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Object Name</label>
         <input required value={name} onChange={e => setName(e.target.value)} className="w-full text-sm p-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500" placeholder="e.g. 엑스칼리버" />
      </div>
      <div>
         <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Description (English Details Recommended)</label>
         <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4} className="w-full text-sm p-2 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500" placeholder="e.g. glowing golden sword, intricate runes on the blade" />
      </div>
      <button type="submit" className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm font-bold transition-colors">
        추가하기
      </button>
    </form>
  );
}

function ObjectCard({ item }: { item: ObjectItem }) {
  const { deleteObject } = useAppStore();
  return (
    <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm group">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-amber-700 dark:text-amber-500 text-lg flex items-center gap-1.5"><Package className="w-4 h-4"/>{item.name}</h4>
        <button onClick={() => deleteObject(item.id)} className="text-slate-400 hover:text-red-500 transition-colors hidden group-hover:block"><Trash2 className="w-4 h-4" /></button>
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-300">{item.description}</p>
    </div>
  );
}
