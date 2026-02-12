import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTranslation } from 'react-i18next';
import { fetchModels } from '../../api/models';
import type { ModelInfo } from '../../api/models';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, User, X, Check, Pencil, RefreshCw, ChevronDown, Box, Eye, EyeOff, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { API_CONFIG } from '../../config/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileManagerDialog = ({ open, onOpenChange }: Props) => {
  const { t, i18n } = useTranslation();
  const { profiles, activeProfileId, addProfile, updateProfile, deleteProfile, setActiveProfile } = useSettingsStore();

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const time = d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit' });
    return `${time} ${date}`;
  };

  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // SEPARATION OF CONCERNS:
  // activeProfileId (Record<STORE>): The profile used for API calls.
  // selectedProfileId (Local UI): The profile currently being viewed/edited in the right panel.
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(activeProfileId);

  // Model selection state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [fetching, setFetching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync selection when dialog opens or active changes (if nothing selected)
  if (selectedProfileId === null && activeProfileId) {
      setSelectedProfileId(activeProfileId);
  }

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  // Close dropdown on outside click or profile switch
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
     setDropdownOpen(false);
     setModels([]); // Clear models when switching to avoid confusion
  }, [selectedProfileId]);

  const handleFetchModels = async () => {
    const isAuthValid = selectedProfile?.noAuth || selectedProfile?.apiKey;
    if (!selectedProfile?.apiUrl || !isAuthValid) {
        toast.error(t('settings.requiredFields'));
        return;
    }
    setFetching(true);
    try {
      const fetched = await fetchModels(selectedProfile.apiUrl.trim(), selectedProfile.apiKey.trim(), selectedProfile.apiType);
      setModels(fetched);
      if (fetched.length > 0) {
        setDropdownOpen(true);
        toast.success(t('settings.modelsFetched', { count: fetched.length }));
      } else {
        toast.info(t('profiles.fetchModelsNone'));
      }
    } catch {
      toast.error(t('profiles.fetchModelsError'));
    } finally {
      setFetching(false);
    }
  };

  const handleSelectModel = (m: string) => {
    if (selectedProfileId) {
        updateProfile(selectedProfileId, { selectedModel: m });
        setDropdownOpen(false);
    }
  };

  const clearModel = () => {
    if (selectedProfileId) {
        updateProfile(selectedProfileId, { selectedModel: '' });
    }
  };

  const filteredModels = models.length > 0 && selectedProfile?.selectedModel
    ? models.filter(m => m.id.toLowerCase().includes(selectedProfile.selectedModel.toLowerCase()))
    : models;

  const selectedModelInfo = models.find(m => m.id === selectedProfile?.selectedModel);

  // --- Creation Handlers ---
  const startCreate = () => {
    setIsCreating(true);
    setNewProfileName('');
  };

  const confirmCreate = () => {
    if (!newProfileName.trim()) {
        toast.error(t('profiles.emptyName'));
        return;
    }
    const newId = crypto.randomUUID();
    addProfile({
      id: newId,
      name: newProfileName.trim(),
      apiType: 'ollama',
      apiUrl: 'https://127.0.0.1:11434',
      apiKey: '',
      noAuth: true,
      selectedModel: 'llama3.2'
    });
    
    // Auto-select for editing, but DO NOT auto-activate (per user request implied logic)
    // Actually, user said "prevent activating incomplete".
    // A new profile has empty key, so it IS incomplete.
    // So we should NOT set active. Just set selected.
    setSelectedProfileId(newId);
    
    setIsCreating(false);
    setNewProfileName('');
    toast.success(t('profiles.created'));
  };

  const cancelCreate = () => {
    setIsCreating(false);
    setNewProfileName('');
  };

  // --- Editing Handlers ---
  const startEdit = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(currentName);
  };

  const confirmEdit = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!editName.trim()) {
        toast.error("Profile name cannot be empty");
        return;
    }
    updateProfile(id, { name: editName.trim() });
    setEditingId(null);
    setEditName('');
    toast.success(t('profiles.renamed'));
  };

  const cancelEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditName('');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const profileToDelete = profiles.find(p => p.id === id);
    if (!profileToDelete) return;

    toast(t('profiles.deleteConfirmQuestion', { name: profileToDelete.name }), {
      action: {
        label: t('profiles.confirm'),
        onClick: () => {
          deleteProfile(id);
          // If we deleted the selected one, select the next available or null
          if (id === selectedProfileId) {
              const remaining = profiles.filter(p => p.id !== id);
              setSelectedProfileId(activeProfileId === id ? (remaining[0]?.id || null) : activeProfileId);
          }
          toast.success(t('profiles.deleteConfirm'));
        }
      },
      cancel: {
        label: t('profiles.cancel'),
        onClick: () => {}
      }
    });
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-4xl h-[600px] mx-4 border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-2xl flex overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Left Sidebar: Profile List */}
        <div className="w-1/3 border-r border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-900/50 flex flex-col">
            <div className="p-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="font-semibold text-neutral-900 dark:text-white">{t('profiles.title')}</h2>
                <button 
                  onClick={startCreate} 
                  disabled={isCreating}
                  className="p-1.5 hover:bg-neutral-200 dark:hover:bg-zinc-800 rounded-md text-neutral-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* Creation Input */}
                <AnimatePresence>
                  {isCreating && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-2 bg-neutral-100 dark:bg-zinc-900/50 rounded-lg border border-neutral-300 dark:border-zinc-700 overflow-hidden"
                    >
                      <input
                        autoFocus
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmCreate();
                          if (e.key === 'Escape') cancelCreate();
                        }}
                        placeholder={t('profiles.title')}
                        className="w-full bg-white dark:bg-zinc-950 border border-neutral-200 dark:border-zinc-800 rounded px-2 py-1.5 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-white mb-2"
                      />
                      <div className="flex justify-end gap-2">
                         <button onClick={cancelCreate} className="p-1 hover:bg-neutral-200 dark:hover:bg-zinc-800 rounded text-neutral-400 dark:text-zinc-500 hover:text-neutral-900 dark:hover:text-white">
                            <X className="w-3.5 h-3.5" />
                         </button>
                         <button onClick={confirmCreate} className="p-1 hover:bg-neutral-200 dark:hover:bg-zinc-800 rounded text-neutral-900 dark:text-white">
                            <Check className="w-3.5 h-3.5" />
                         </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {[...profiles].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(profile => {
                    const isAuthValid = profile.noAuth || profile.apiKey?.trim();
                    const isValid = isAuthValid && profile.apiUrl?.trim() && profile.selectedModel?.trim();
                    const isActive = profile.id === activeProfileId;
                    const isSelected = profile.id === selectedProfileId;
                    
                    return (
                    <div
                        key={profile.id}
                        onClick={() => !editingId && setSelectedProfileId(profile.id)}
                        className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                            isSelected && !editingId
                            ? 'bg-neutral-200 dark:bg-zinc-800 border-neutral-300 dark:border-zinc-700' 
                            : 'hover:bg-neutral-100 dark:hover:bg-zinc-900/50 border-transparent'
                        } border`}
                    >
                        {editingId === profile.id ? (
                           // Editing Mode
                           <div className="flex-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') confirmEdit(profile.id, e);
                                  if (e.key === 'Escape') cancelEdit(e);
                                }}
                                className="flex-1 bg-white dark:bg-zinc-950 border border-neutral-200 dark:border-zinc-800 rounded px-2 py-1 text-sm text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-white"
                              />
                               <button onClick={(e) => cancelEdit(e)} className="p-1 hover:bg-neutral-200 dark:hover:bg-zinc-800 rounded text-neutral-400 dark:text-zinc-500 hover:text-neutral-900 dark:hover:text-white">
                                  <X className="w-3.5 h-3.5" />
                               </button>
                               <button onClick={(e) => confirmEdit(profile.id, e)} className="p-1 hover:bg-neutral-200 dark:hover:bg-zinc-800 rounded text-neutral-900 dark:text-white">
                                  <Check className="w-3.5 h-3.5" />
                               </button>
                           </div>
                        ) : (
                           // Display Mode
                           <>
                              <div className="flex items-center gap-3 overflow-hidden">
                                  {/* Radio/Check Selector */}
                                  <div 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isValid) {
                                            setActiveProfile(profile.id);
                                            // Optional: Also select it for editing? Maybe not needed if they just want to switch.
                                            toast.success(t('profiles.activeSet', { name: profile.name }));
                                        } else {
                                            toast.error(t('profiles.incomplete'));
                                            // Select it so they can fix it
                                            setSelectedProfileId(profile.id);
                                        }
                                    }}
                                    className={`w-5 h-5 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                                        isActive 
                                        ? 'bg-neutral-900 dark:bg-white border-neutral-900 dark:border-white text-white dark:text-black' 
                                        : isValid 
                                            ? 'border-neutral-400 dark:border-zinc-600 hover:border-neutral-900 dark:hover:border-white hover:bg-neutral-100 dark:hover:bg-zinc-800' 
                                            : 'border-neutral-200 dark:border-zinc-800 opacity-40 cursor-not-allowed'
                                    }`}
                                    title={isValid ? "Set as Active Profile" : "Incomplete Profile"}
                                  >
                                    {isActive && <Check className="w-3 h-3" />}
                                  </div>

                                  <div className="flex flex-col overflow-hidden">
                                    <span className={`truncate font-medium text-sm ${isActive ? 'text-neutral-900 dark:text-white' : 'text-neutral-700 dark:text-zinc-300'}`}>
                                        {profile.name}
                                    </span>
                                    {profile.updatedAt && (
                                        <span className="text-[10px] text-neutral-400 dark:text-zinc-500 truncate">
                                            {formatTime(profile.updatedAt)}
                                        </span>
                                    )}
                                  </div>
                              </div>
                              
                              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  {/* Rename button */}
                                  <button 
                                      onClick={(e) => startEdit(profile.id, profile.name, e)}
                                      className="p-1.5 hover:bg-neutral-200 dark:hover:bg-zinc-800 text-neutral-400 dark:text-zinc-500 hover:text-neutral-900 dark:hover:text-white rounded-md transition-all mr-1"
                                      title={t('profiles.rename')}
                                  >
                                      <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  
                                  {/* Delete button (now works for last profile too) */}
                                   <button 
                                      onClick={(e) => handleDelete(profile.id, e)}
                                      className="p-1.5 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-all"
                                      title={t('profiles.delete')}
                                  >
                                      <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                              </div>
                           </>
                        )}
                    </div>
                )})}
                
                {profiles.length === 0 && !isCreating && (
                    <div className="py-8 px-4 text-center">
                        <div className="w-12 h-12 bg-neutral-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-3">
                            <User className="w-6 h-6 text-neutral-400 dark:text-zinc-500 opacity-50" />
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-4">{t('profiles.noProfileYet')}</p>
                        <button 
                            onClick={startCreate}
                            className="text-xs font-semibold text-neutral-900 dark:text-white hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                        >
                            + {t('profiles.createFirst')}
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* Right Content: Stats & Settings */}
        <div className="flex-1 flex flex-col bg-neutral-100/30 dark:bg-zinc-950">
             <div className="p-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="font-semibold text-neutral-900 dark:text-white">{t('profiles.settings')}</h2>
                <button onClick={() => onOpenChange(false)} className="text-neutral-400 dark:text-zinc-500 hover:text-neutral-900 dark:hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                {selectedProfile ? (
                    <div className="max-w-xl space-y-8">
                        {/* Status Banner */}
                        {(() => {
                            const isAuthValid = selectedProfile.noAuth || selectedProfile.apiKey?.trim();
                            if (!isAuthValid) {
                                return (
                                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                            <span>⚠️</span>
                                            {t('profiles.incompleteBanner')}
                                        </p>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* API Type Selector */}
                        <div className="space-y-3">
                            <label className="text-xs font-medium text-neutral-500 dark:text-zinc-500 uppercase tracking-wider">{t('settings.apiType')}</label>
                            <div className="flex bg-neutral-100 dark:bg-zinc-900/50 p-1 rounded-xl border border-neutral-200 dark:border-zinc-800">
                                {(['ollama', 'gemini', 'openai'] as const).map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => {
                                            updateProfile(selectedProfile.id, { apiType: type });
                                            if (!selectedProfile.customApiUrl) {
                                                const defaultUrl = (API_CONFIG as any).DEFAULT_ENDPOINTS[type];
                                                updateProfile(selectedProfile.id, { apiUrl: defaultUrl });
                                            }
                                        }}
                                        className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                                            selectedProfile.apiType === type
                                                ? 'bg-white dark:bg-zinc-800 text-neutral-900 dark:text-white shadow-sm ring-1 ring-neutral-200 dark:ring-zinc-700'
                                                : 'text-neutral-500 dark:text-zinc-500 hover:text-neutral-700 dark:hover:text-zinc-300'
                                        }`}
                                    >
                                        {t(`settings.apiType${type === 'openai' ? 'OpenAI' : type.charAt(0).toUpperCase() + type.slice(1)}`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                         <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                 <label className="text-xs font-medium text-neutral-500 dark:text-zinc-500 uppercase tracking-wider">{t('settings.apiUrl')}</label>
                                 <label className="flex items-center gap-2 cursor-pointer group">
                                     <span className="text-[10px] text-neutral-400 dark:text-zinc-500 group-hover:text-neutral-600 dark:group-hover:text-zinc-300 transition-colors">{t('settings.customApiUrl')}</span>
                                     <input 
                                         type="checkbox"
                                         checked={!!selectedProfile.customApiUrl}
                                         onChange={(e) => {
                                             const isCustom = e.target.checked;
                                             updateProfile(selectedProfile.id, { customApiUrl: isCustom });
                                             if (!isCustom) {
                                                 const defaultUrl = (API_CONFIG as any).DEFAULT_ENDPOINTS[selectedProfile.apiType];
                                                 updateProfile(selectedProfile.id, { apiUrl: defaultUrl });
                                             }
                                         }}
                                         className="w-3 h-3 rounded border-neutral-400 dark:border-zinc-700 text-neutral-900 dark:text-white focus:ring-neutral-900 dark:focus:ring-white bg-transparent"
                                     />
                                 </label>
                              </div>
                              <input 
                                 value={selectedProfile.apiUrl}
                                 onChange={(e) => updateProfile(selectedProfile.id, { apiUrl: e.target.value })}
                                 disabled={!selectedProfile.customApiUrl}
                                 className={`w-full bg-white dark:bg-zinc-900 border border-neutral-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 text-sm font-mono text-neutral-700 dark:text-zinc-300 focus:outline-none focus:border-neutral-900 dark:focus:border-white transition-colors ${!selectedProfile.customApiUrl ? 'opacity-40 cursor-not-allowed' : ''}`}
                             />
                         </div>

                         <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                 <label className="text-xs font-medium text-neutral-500 dark:text-zinc-500 uppercase tracking-wider">{t('settings.apiKey')}</label>
                                 <label className="flex items-center gap-2 cursor-pointer group">
                                     <span className="text-[10px] text-neutral-400 dark:text-zinc-500 group-hover:text-neutral-600 dark:group-hover:text-zinc-300 transition-colors">{t('settings.noAuth')}</span>
                                     <input 
                                         type="checkbox"
                                         checked={!!selectedProfile.noAuth}
                                         onChange={(e) => updateProfile(selectedProfile.id, { noAuth: e.target.checked })}
                                         className="w-3 h-3 rounded border-neutral-400 dark:border-zinc-700 text-neutral-900 dark:text-white focus:ring-neutral-900 dark:focus:ring-white bg-transparent"
                                     />
                                 </label>
                              </div>
                              <div className="relative">
                                  <input 
                                     type={showApiKey ? "text" : "password"}
                                     value={selectedProfile.apiKey}
                                     onChange={(e) => updateProfile(selectedProfile.id, { apiKey: e.target.value })}
                                     placeholder={selectedProfile.noAuth ? "Authorization not required" : "sk-..."}
                                     disabled={selectedProfile.noAuth}
                                     className={`w-full bg-white dark:bg-zinc-900 border border-neutral-200 dark:border-zinc-800 rounded-lg px-4 py-2.5 pr-10 text-sm font-mono text-neutral-700 dark:text-zinc-300 focus:outline-none focus:border-neutral-900 dark:focus:border-white transition-colors ${selectedProfile.noAuth ? 'opacity-40 cursor-not-allowed mb-0' : ''}`}
                                 />
                                 {!selectedProfile.noAuth && (
                                     <button
                                         type="button"
                                         onClick={() => setShowApiKey(!showApiKey)}
                                         className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-zinc-500 hover:text-neutral-600 dark:group-hover:text-zinc-300 transition-colors"
                                     >
                                         {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                     </button>
                                 )}
                              </div>
                         </div>
                        
                         <div className="space-y-2">
                             <label className="text-xs font-medium text-neutral-500 dark:text-zinc-500 uppercase tracking-wider">{t('settings.model')}</label>
                             <div className="relative" ref={dropdownRef}>
                                <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-zinc-500 z-10" />
                                <input 
                                    value={selectedProfile.selectedModel}
                                    onChange={(e) => {
                                        updateProfile(selectedProfile.id, { selectedModel: e.target.value });
                                        if (models.length > 0) setDropdownOpen(true);
                                    }}
                                    onFocus={() => {
                                        if (models.length > 0) setDropdownOpen(true);
                                    }}
                                    placeholder={t('profiles.modelIdPlaceholder')}
                                    className={`w-full bg-white dark:bg-zinc-900 border border-neutral-200 dark:border-zinc-800 rounded-lg ${selectedModelInfo?.thinking ? 'pl-11' : 'pl-10'} pr-24 py-2.5 text-sm font-mono text-neutral-700 dark:text-zinc-300 focus:outline-none focus:border-neutral-900 dark:focus:border-white transition-colors`}
                                />
                                
                                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    {selectedProfile.selectedModel && (
                                        <button
                                            onClick={clearModel}
                                            className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
                                            title={t('profiles.clearModel')}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    
                                     {models.length > 0 && (
                                      <button
                                          type="button"
                                          onClick={() => setDropdownOpen(!dropdownOpen)}
                                          className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors"
                                      >
                                          <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 dark:text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                                      </button>
                                     )}

                                    <button
                                        onClick={handleFetchModels}
                                        disabled={fetching || !selectedProfile.apiUrl?.trim() || (!selectedProfile.noAuth && !selectedProfile.apiKey?.trim())}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-neutral-200 dark:bg-zinc-800 text-[11px] font-medium text-neutral-600 dark:text-zinc-300 hover:bg-neutral-300 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${fetching ? 'animate-spin' : ''}`} />
                                        {fetching ? 'Fetching' : 'Fetch'}
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {dropdownOpen && (models.length > 0 || filteredModels.length > 0) && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4, scaleY: 0.96 }}
                                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                                        exit={{ opacity: 0, y: -4, scaleY: 0.96 }}
                                        transition={{ duration: 0.15, ease: 'easeOut' }}
                                        style={{ transformOrigin: 'top' }}
                                        className="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
                                    >
                                        {filteredModels.map((m) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => handleSelectModel(m.id)}
                                            className={`w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-mono transition-colors cursor-pointer hover:bg-neutral-100 dark:hover:bg-zinc-800 ${m.id === selectedProfile.selectedModel
                                                ? 'text-neutral-900 dark:text-white bg-neutral-100 dark:bg-zinc-800/50'
                                                : 'text-neutral-500 dark:text-zinc-400'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 overflow-hidden">
                                                {m.id === selectedProfile.selectedModel ? (
                                                    <Check className="w-3 h-3 shrink-0 text-neutral-900 dark:text-white" />
                                                ) : (
                                                    <div className="w-3" />
                                                )}
                                                <span className="truncate">{m.id}</span>
                                            </div>
                                            {m.thinking && (
                                                <div title="Reasoning model">
                                                    <Brain className="w-3 h-3 text-neutral-600 dark:text-neutral-400 shrink-0" />
                                                </div>
                                            )}
                                        </button>
                                        ))}
                                        {filteredModels.length === 0 && (
                                            <div className="px-3.5 py-2 text-xs text-zinc-500">{t('profiles.noModels')}</div>
                                        )}
                                    </motion.div>
                                    )}
                                </AnimatePresence>
                             </div>
                            <p className="text-xs text-zinc-600">{t('profiles.modelHint')}</p>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-400 dark:text-zinc-500">
                        <User className="w-12 h-12 mb-4 opacity-20" />
                        <p>{t('profiles.noProfileSelected')}</p>
                    </div>
                )}
            </div>
            
            <div className="p-4 border-t border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-900/30">
                <p className="text-xs text-center text-neutral-400 dark:text-zinc-600">
                    {t('profiles.autoSaveHint')}
                </p>
            </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
