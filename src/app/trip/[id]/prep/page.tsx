'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, FileText, Backpack, Briefcase, ExternalLink, ChevronDown, Plus, Globe, Loader2, Volume2, RefreshCw } from 'lucide-react';
import { prepTasks, packingItems, trips } from '@/data/mock';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrepTask { id: string; category: string; title: string; dueDate?: string; completed: boolean; urgent?: boolean; }
interface PackingItem { id: string; name: string; category: string; packed: boolean; affiliateUrl?: string; }

interface TranslationPhrase {
  id: string;
  english: string;
  local: string;
  phonetic: string;
  tip?: string;
}

interface PhraseCategory {
  id: string;
  label: string;
  icon: string;
  phrases: TranslationPhrase[];
}

interface PhrasebookData {
  language: string;
  languageCode: string;
  destination: string;
  categories: PhraseCategory[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrepPage() {
  const [activeTab, setActiveTab] = useState<'documents' | 'packing' | 'logistics' | 'phrases'>('documents');
  const [completedTasks, setCompletedTasks] = useState(new Set(prepTasks.filter(t => t.completed).map((t: PrepTask) => t.id)));
  const [packedItems, setPackedItems] = useState(new Set(packingItems.filter(p => p.packed).map((p: PackingItem) => p.id)));
  const [expandedCategories, setExpandedCategories] = useState(new Set(['Clothing']));
  const [customDocTasks, setCustomDocTasks] = useState<Array<{id: string; title: string; completed: boolean}>>([]);
  const [customLogTasks, setCustomLogTasks] = useState<Array<{id: string; title: string; completed: boolean}>>([]);
  const [customPackItems, setCustomPackItems] = useState<Array<{id: string; name: string; category: string; packed: boolean; affiliateUrl?: string}>>([]);
  const [newDocItem, setNewDocItem] = useState('');
  const [newLogItem, setNewLogItem] = useState('');
  const [newPackItem, setNewPackItem] = useState('');
  const [newPackCategory, setNewPackCategory] = useState('Clothing');

  // Phrases tab state
  const [phrasebook, setPhrasebook] = useState<PhrasebookData | null>(null);
  const [phrasesLoading, setPhrasesLoading] = useState(false);
  const [phrasesError, setPhrasesError] = useState<string | null>(null);
  const [expandedPhraseCategories, setExpandedPhraseCategories] = useState<Set<string>>(new Set(['greetings']));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const documentTasks = prepTasks.filter((t: PrepTask) => t.category === 'document');
  const logisticsTasks = prepTasks.filter((t: PrepTask) => t.category === 'logistics');
  const tripDestination = trips[0]?.destination ?? 'Iceland';

  const toggleDocTask = (taskId: string) => {
    const newCompleted = new Set(completedTasks);
    if (newCompleted.has(taskId)) newCompleted.delete(taskId); else newCompleted.add(taskId);
    setCompletedTasks(newCompleted);
  };

  const togglePackedItem = (itemId: string) => {
    const newPacked = new Set(packedItems);
    if (newPacked.has(itemId)) newPacked.delete(itemId); else newPacked.add(itemId);
    setPackedItems(newPacked);
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) newExpanded.delete(category); else newExpanded.add(category);
    setExpandedCategories(newExpanded);
  };

  const togglePhraseCategory = (id: string) => {
    setExpandedPhraseCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCopyPhrase = (phrase: TranslationPhrase) => {
    navigator.clipboard.writeText(phrase.local).catch(() => {});
    setCopiedId(phrase.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const loadPhrasebook = async () => {
    setPhrasesLoading(true);
    setPhrasesError(null);
    try {
      const res = await fetch('/api/generate-phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: tripDestination }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: PhrasebookData = await res.json();
      if ((data as any).error) throw new Error((data as any).message || 'Generation failed');
      setPhrasebook(data);
      // Expand first category by default
      if (data.categories.length > 0) {
        setExpandedPhraseCategories(new Set([data.categories[0].id]));
      }
    } catch (err) {
      setPhrasesError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPhrasesLoading(false);
    }
  };

  // Overall progress
  const allDocTasks = [...documentTasks, ...customDocTasks];
  const allLogTasks = [...logisticsTasks, ...customLogTasks];
  const allPackItems = [...packingItems, ...customPackItems];

  const docCompleted = allDocTasks.filter(t => completedTasks.has(t.id) || (customDocTasks.some((ct: any) => ct.id === t.id) && customDocTasks.find((ct: any) => ct.id === t.id)?.completed)).length;
  const logCompleted = allLogTasks.filter(t => completedTasks.has(t.id) || (customLogTasks.some((ct: any) => ct.id === t.id) && customLogTasks.find((ct: any) => ct.id === t.id)?.completed)).length;
  const packCompleted = allPackItems.filter((i: any) => packedItems.has(i.id) || (customPackItems.some(cp => cp.id === i.id) && customPackItems.find(cp => cp.id === i.id)?.packed)).length;

  const totalCompleted = docCompleted + logCompleted + packCompleted;
  const totalItems = (allDocTasks.length || 1) + (allLogTasks.length || 1) + (allPackItems.length || 1);
  const overallProgress = Math.round((totalCompleted / totalItems) * 100);

  // ─── Checkmark SVG helper ──────────────────────────────────────────────────
  const CheckboxChecked = () => (
    <div className="w-6 h-6 bg-sky-800 rounded border-2 border-sky-600 flex items-center justify-center">
      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
  const CheckboxEmpty = () => <div className="w-6 h-6 rounded border-2 border-zinc-300" />;

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  const renderDocumentsTab = () => {
    const all = [...documentTasks, ...customDocTasks];
    const completed = all.filter(t => completedTasks.has(t.id) || customDocTasks.find((ct: any) => ct.id === t.id)?.completed).length;
    const total = all.length || 1;
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-sky-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-zinc-900">Important Stuff</h3>
              <p className="text-sm text-zinc-600 mt-0.5">Passport, visas, travel papers — don't leave without these</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
              <div className="bg-sky-800 h-full transition-all duration-300" style={{ width: `${Math.round((completed / total) * 100)}%` }} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-zinc-900">{completed}/{total} completed</span>
              <span className="text-xs text-zinc-500">{total - completed} remaining</span>
            </div>
          </div>
        </div>

        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sky-900 mb-1">Passport Validity</h3>
              <p className="text-sm text-sky-800">Your passport expires on 2027-03-15. You have 11 months remaining — plenty of time for this trip!</p>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-emerald-900 mb-1">Visa Status</h3>
              <p className="text-sm text-emerald-700">No visa required for US citizens visiting Iceland (Schengen area). Your passport and ETIAS (when available) will be sufficient.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          {documentTasks.map((task: PrepTask, index: number) => (
            <div key={task.id} className={`flex items-center gap-4 px-6 py-4 ${index !== documentTasks.length - 1 ? 'border-b border-zinc-100' : ''} ${completedTasks.has(task.id) ? 'bg-zinc-50' : ''}`}>
              <button onClick={() => toggleDocTask(task.id)} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                {completedTasks.has(task.id) ? <CheckboxChecked /> : <CheckboxEmpty />}
              </button>
              <div className="flex-1">
                <p className={`font-medium ${completedTasks.has(task.id) ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{task.title}</p>
                {task.dueDate && <p className="text-xs text-zinc-500 mt-1">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
              </div>
              {task.urgent && !completedTasks.has(task.id) && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-sky-800" />}
            </div>
          ))}
          {customDocTasks.map((task) => (
            <div key={task.id} className={`flex items-center gap-4 px-6 py-4 border-t border-zinc-100 ${task.completed ? 'bg-zinc-50' : ''}`}>
              <button onClick={() => setCustomDocTasks(prev => prev.map(t => t.id === task.id ? {...t, completed: !t.completed} : t))} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                {task.completed ? <CheckboxChecked /> : <CheckboxEmpty />}
              </button>
              <p className={`font-medium flex-1 ${task.completed ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{task.title}</p>
              <span className="text-xs px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">Custom</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
          <div className="flex gap-2">
            <input type="text" placeholder="Add Document task..." value={newDocItem} onChange={(e) => setNewDocItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newDocItem.trim()) { setCustomDocTasks(prev => [...prev, { id: `custom_doc_${Date.now()}`, title: newDocItem.trim(), completed: false }]); setNewDocItem(''); } }}
              className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm" />
            <button onClick={() => { if (newDocItem.trim()) { setCustomDocTasks(prev => [...prev, { id: `custom_doc_${Date.now()}`, title: newDocItem.trim(), completed: false }]); setNewDocItem(''); } }}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-800 hover:bg-sky-900 text-white flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPackingTab = () => {
    const categories = ['Clothing', 'Accessories', 'Documents', 'Electronics', 'Toiletries', 'Gear'];
    const totalCustomPacked = customPackItems.filter(i => i.packed).length;
    const totalPacked = packedItems.size + totalCustomPacked;
    const totalItems = packingItems.length + customPackItems.length || 1;
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Backpack className="w-6 h-6 text-sky-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-zinc-900">Pack This</h3>
              <p className="text-sm text-zinc-600 mt-0.5">AI-curated for Iceland in September</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
              <div className="bg-sky-800 h-full transition-all duration-300" style={{ width: `${Math.round((totalPacked / totalItems) * 100)}%` }} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-zinc-900">{totalPacked}/{totalItems} packed</span>
              <span className="text-xs text-zinc-500">{totalItems - totalPacked} remaining</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="font-medium text-blue-900">Expected weather: <span className="font-semibold">5-12°C, rain likely</span></p>
          <p className="text-sm text-blue-700 mt-1">Pack layers and waterproof gear!</p>
        </div>

        <div className="space-y-3">
          {categories.map(category => {
            const categoryItems = [...packingItems.filter((i: PackingItem) => i.category === category), ...customPackItems.filter(i => i.category === category)];
            const categoryPacked = categoryItems.filter((i: any) => packedItems.has(i.id) || (customPackItems.some(cp => cp.id === i.id) && customPackItems.find(cp => cp.id === i.id)?.packed)).length;
            const isExpanded = expandedCategories.has(category);
            return (
              <div key={category} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                <button onClick={() => toggleCategory(category)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-zinc-900">{category}</span>
                    <span className="text-xs font-medium px-2 py-1 bg-zinc-100 text-zinc-700 rounded-full">{categoryPacked}/{categoryItems.length}</span>
                  </div>
                  <div className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}><ChevronDown className="w-5 h-5 text-zinc-600" /></div>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-zinc-100">
                    {categoryItems.map((item: any) => {
                      const isCustom = customPackItems.some(cp => cp.id === item.id);
                      const isPacked = isCustom ? customPackItems.find(cp => cp.id === item.id)?.packed : packedItems.has(item.id);
                      return (
                        <div key={item.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50 transition-colors">
                          <button onClick={() => { if (isCustom) { setCustomPackItems(prev => prev.map(p => p.id === item.id ? {...p, packed: !p.packed} : p)); } else { togglePackedItem(item.id); } }} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                            {isPacked ? <CheckboxChecked /> : <CheckboxEmpty />}
                          </button>
                          <div className="flex-1">
                            <p className={`font-medium ${isPacked ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{item.name}</p>
                          </div>
                          {!isCustom && item.affiliateUrl && (
                            <a href={item.affiliateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 bg-sky-100 text-sky-800 hover:bg-sky-200 text-xs font-semibold rounded transition-all">
                              <ExternalLink className="w-3 h-3" /> Shop
                            </a>
                          )}
                          {isCustom && <span className="text-xs px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">Custom</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex gap-2">
            <select value={newPackCategory} onChange={(e) => setNewPackCategory(e.target.value)} className="px-4 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700">
              {['Clothing', 'Accessories', 'Documents', 'Electronics', 'Toiletries', 'Gear'].map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <input type="text" placeholder="Add packing item..." value={newPackItem} onChange={(e) => setNewPackItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newPackItem.trim()) { setCustomPackItems(prev => [...prev, { id: `custom_pack_${Date.now()}`, name: newPackItem.trim(), category: newPackCategory, packed: false }]); setNewPackItem(''); } }}
              className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm" />
            <button onClick={() => { if (newPackItem.trim()) { setCustomPackItems(prev => [...prev, { id: `custom_pack_${Date.now()}`, name: newPackItem.trim(), category: newPackCategory, packed: false }]); setNewPackItem(''); } }}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-800 hover:bg-sky-900 text-white flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderLogisticsTab = () => {
    const all = [...logisticsTasks, ...customLogTasks];
    const completed = all.filter(t => completedTasks.has(t.id) || customLogTasks.find((ct: any) => ct.id === t.id)?.completed).length;
    const total = all.length || 1;
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-6 h-6 text-sky-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-zinc-900">Admin</h3>
              <p className="text-sm text-zinc-600 mt-0.5">Flights, transport, and the boring-but-necessary stuff</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
              <div className="bg-sky-800 h-full transition-all duration-300" style={{ width: `${Math.round((completed / total) * 100)}%` }} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-zinc-900">{completed}/{total} completed</span>
              <span className="text-xs text-zinc-500">{total - completed} remaining</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          {logisticsTasks.map((task: PrepTask, index: number) => (
            <div key={task.id} className={`flex items-center gap-4 px-6 py-4 ${index !== logisticsTasks.length - 1 ? 'border-b border-zinc-100' : ''} ${completedTasks.has(task.id) ? 'bg-zinc-50' : ''}`}>
              <button onClick={() => toggleDocTask(task.id)} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                {completedTasks.has(task.id) ? <CheckboxChecked /> : <CheckboxEmpty />}
              </button>
              <div className="flex-1">
                <p className={`font-medium ${completedTasks.has(task.id) ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{task.title}</p>
                {task.dueDate && <p className="text-xs text-zinc-500 mt-1">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
              </div>
              {task.urgent && !completedTasks.has(task.id) && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-sky-800" />}
            </div>
          ))}
          {customLogTasks.map((task) => (
            <div key={task.id} className={`flex items-center gap-4 px-6 py-4 border-t border-zinc-100 ${task.completed ? 'bg-zinc-50' : ''}`}>
              <button onClick={() => setCustomLogTasks(prev => prev.map(t => t.id === task.id ? {...t, completed: !t.completed} : t))} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                {task.completed ? <CheckboxChecked /> : <CheckboxEmpty />}
              </button>
              <p className={`font-medium flex-1 ${task.completed ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{task.title}</p>
              <span className="text-xs px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">Custom</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
          <div className="flex gap-2">
            <input type="text" placeholder="Add something to handle..." value={newLogItem} onChange={(e) => setNewLogItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newLogItem.trim()) { setCustomLogTasks(prev => [...prev, { id: `custom_log_${Date.now()}`, title: newLogItem.trim(), completed: false }]); setNewLogItem(''); } }}
              className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm" />
            <button onClick={() => { if (newLogItem.trim()) { setCustomLogTasks(prev => [...prev, { id: `custom_log_${Date.now()}`, title: newLogItem.trim(), completed: false }]); setNewLogItem(''); } }}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-800 hover:bg-sky-900 text-white flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex gap-3">
            <Briefcase className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">SIM Card & Data Plan</h3>
              <p className="text-sm text-blue-700">Iceland has excellent 4G coverage. Consider buying a local SIM at Keflavik Airport (cheaper than roaming). Providers: Nova, Siminn, Vodafone.</p>
            </div>
          </div>
        </div>
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sky-900 mb-1">Currency Exchange: Icelandic Króna (ISK)</h3>
              <p className="text-sm text-sky-800 mb-2">Current rate: 1 USD = ~134 ISK</p>
              <p className="text-sm text-sky-800">Most establishments accept cards. Withdraw ISK at airport ATM or change money at banks.</p>
            </div>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-emerald-900 mb-1">Airport Transfer: Arranged</h3>
              <p className="text-sm text-emerald-700">Rental car pickup at Keflavik Airport, 15 September 3:00 PM. Return car on 21 September before your flight.</p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900 mb-1">Emergency Information</h3>
              <ul className="text-sm text-red-700 space-y-1 mt-2">
                <li><span className="font-semibold">Emergency Number:</span> 112</li>
                <li><span className="font-semibold">Nearest Hospital:</span> Landspítali University Hospital, Reykjavik</li>
                <li><span className="font-semibold">US Embassy:</span> +354 595-2100, Reykjavik</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPhrasesTab = () => {
    // Empty / pre-load state
    if (!phrasebook && !phrasesLoading && !phrasesError) {
      return (
        <div className="space-y-6">
          {/* Header card */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                <Globe className="w-6 h-6 text-sky-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-zinc-900">Phrase Guide</h3>
                <p className="text-sm text-zinc-600 mt-0.5">
                  AI-generated key phrases in the local language for {tripDestination}
                </p>
              </div>
            </div>
          </div>
          {/* CTA */}
          <div className="text-center py-12 bg-white rounded-2xl border border-zinc-100 shadow-sm">
            <Globe className="w-12 h-12 text-sky-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Ready to brush up on your Icelandic?</h3>
            <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
              Generate a practical phrasebook with pronunciation guides for your trip — greetings, dining, transport, emergencies, and more.
            </p>
            <button
              onClick={loadPhrasebook}
              className="px-6 py-3 bg-sky-800 hover:bg-sky-900 text-white rounded-xl font-semibold transition-colors inline-flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              Generate Phrasebook
            </button>
          </div>
        </div>
      );
    }

    // Loading state
    if (phrasesLoading) {
      return (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
          <Loader2 className="w-10 h-10 text-sky-700 animate-spin mx-auto mb-4" />
          <p className="text-lg font-semibold text-zinc-900">Generating your phrasebook…</p>
          <p className="text-sm text-zinc-500 mt-1">AI is curating key phrases for {tripDestination}</p>
        </div>
      );
    }

    // Error state
    if (phrasesError) {
      return (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-zinc-900">Couldn't load phrases</p>
          <p className="text-sm text-zinc-500 mt-1">{phrasesError}</p>
          <button onClick={loadPhrasebook} className="mt-4 px-5 py-2.5 bg-sky-800 text-white rounded-lg text-sm font-medium hover:bg-sky-900 transition-colors">
            Try Again
          </button>
        </div>
      );
    }

    if (!phrasebook) return null;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Globe className="w-6 h-6 text-sky-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-zinc-900">
                {phrasebook.language} Phrases
              </h3>
              <p className="text-sm text-zinc-600 mt-0.5">
                {phrasebook.categories.reduce((acc, c) => acc + c.phrases.length, 0)} phrases across {phrasebook.categories.length} categories for {phrasebook.destination}
              </p>
            </div>
            <button
              onClick={loadPhrasebook}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
          </div>
        </div>

        <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4">
          <p className="text-sm text-sky-800">
            <span className="font-semibold">💡 How to use:</span> Tap any phrase to copy the local text, then paste into Google Translate or show your phone to a local.
          </p>
        </div>

        {/* Categories */}
        <div className="space-y-3">
          {phrasebook.categories.map((cat) => {
            const isExpanded = expandedPhraseCategories.has(cat.id);
            return (
              <div key={cat.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => togglePhraseCategory(cat.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cat.icon}</span>
                    <span className="font-semibold text-zinc-900">{cat.label}</span>
                    <span className="text-xs font-medium px-2 py-1 bg-zinc-100 text-zinc-700 rounded-full">
                      {cat.phrases.length}
                    </span>
                  </div>
                  <div className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-5 h-5 text-zinc-600" />
                  </div>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-zinc-50">
                    {cat.phrases.map((phrase) => (
                      <button
                        key={phrase.id}
                        onClick={() => handleCopyPhrase(phrase)}
                        className="w-full text-left px-6 py-4 hover:bg-zinc-50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
                              {phrase.english}
                            </p>
                            <p className="text-base font-semibold text-zinc-900 leading-snug">
                              {phrase.local}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Volume2 className="w-3 h-3 text-sky-500 flex-shrink-0" />
                              <p className="text-sm text-sky-600 font-medium">{phrase.phonetic}</p>
                            </div>
                            {phrase.tip && (
                              <p className="text-xs text-zinc-400 mt-1.5 italic">{phrase.tip}</p>
                            )}
                          </div>
                          <div className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                            copiedId === phrase.id
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-zinc-100 text-zinc-500 group-hover:bg-sky-100 group-hover:text-sky-700'
                          }`}>
                            {copiedId === phrase.id ? 'Copied!' : 'Tap to copy'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Page shell ───────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-stone-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Pre-Trip</p>
          <h1 className="text-4xl font-bold text-zinc-900 mb-2">Prep Hub</h1>
          <p className="text-zinc-600 mb-6">Everything ready before takeoff</p>
          <div className="w-full bg-zinc-200 rounded-full h-2.5 overflow-hidden">
            <div className="bg-sky-800 h-full transition-all duration-300" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 bg-white rounded-2xl border border-zinc-100 p-1 inline-flex gap-1 flex-wrap">
          {[
            { id: 'documents', label: 'Important Stuff', icon: FileText },
            { id: 'logistics', label: 'Admin', icon: Briefcase },
            { id: 'packing', label: 'Pack This', icon: Backpack },
            { id: 'phrases', label: 'Phrases', icon: Globe },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                  isActive ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div>
          {activeTab === 'documents' && renderDocumentsTab()}
          {activeTab === 'logistics' && renderLogisticsTab()}
          {activeTab === 'packing' && renderPackingTab()}
          {activeTab === 'phrases' && renderPhrasesTab()}
        </div>
      </div>
    </main>
  );
}
