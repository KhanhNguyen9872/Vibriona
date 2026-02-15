import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import type { UserProfile, SystemPromptType } from '../store/useSettingsStore';
import { useTranslation } from 'react-i18next';
import { fetchModels } from '../api/models';
import type { ModelInfo } from '../api/models';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, User, X, Check, Pencil, RefreshCw, ChevronDown, Box, Eye, EyeOff, Brain, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { API_CONFIG } from '../config/api';
import { confirmAction } from '../utils/confirmAction';
import { getSystemPromptLength } from '../api/prompt';
import Select, { type StylesConfig } from 'react-select';

function formatPromptSize(len: number): string {
  return len >= 1000 ? `${(len / 1000).toFixed(1)}K` : String(len);
}

const SYSTEM_PROMPT_OPTION_VALUES: SystemPromptType[] = ['ultra', 'short', 'medium', 'full', 'advanced'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Editable fields we track for dirty-checking
interface DraftFields {
  apiType: UserProfile['apiType'];
  apiUrl: string;
  apiKey: string;
  noAuth: boolean;
  customApiUrl: boolean;
  selectedModel: string;
  systemPromptType: SystemPromptType;
}

function getDraftFromProfile(profile: UserProfile): DraftFields {
  return {
    apiType: profile.apiType,
    apiUrl: profile.apiUrl,
    apiKey: profile.apiKey,
    noAuth: !!profile.noAuth,
    customApiUrl: !!profile.customApiUrl,
    selectedModel: profile.selectedModel,
    systemPromptType: profile.systemPromptType ?? 'medium',
  };
}

export const ProfileManagerDialog = ({ open, onOpenChange }: Props) => {
  const { t, i18n } = useTranslation();
  const { profiles, activeProfileId, addProfile, updateProfile, deleteProfile, setActiveProfile, theme } = useSettingsStore();
  const isDark = theme === 'dark';

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

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(activeProfileId);
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  // Draft state for buffered editing
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Model selection state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [fetching, setFetching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // Sync selection when dialog opens or active changes (if nothing selected)
  if (selectedProfileId === null && activeProfileId) {
    setSelectedProfileId(activeProfileId);
  }

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  // Initialize draft when selected profile changes
  useEffect(() => {
    if (selectedProfile) {
      setDraft(getDraftFromProfile(selectedProfile));
      setValidationErrors({});
    } else {
      setDraft(null);
      setValidationErrors({});
    }
  }, [selectedProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if draft has changes compared to stored profile
  const isDirty = useMemo(() => {
    if (!selectedProfile || !draft) return false;
    const stored = getDraftFromProfile(selectedProfile);
    return (
      stored.apiType !== draft.apiType ||
      stored.apiUrl !== draft.apiUrl ||
      stored.apiKey !== draft.apiKey ||
      stored.noAuth !== draft.noAuth ||
      stored.customApiUrl !== draft.customApiUrl ||
      stored.selectedModel !== draft.selectedModel ||
      stored.systemPromptType !== draft.systemPromptType
    );
  }, [selectedProfile, draft]);

  // Update draft field
  const updateDraft = useCallback((field: keyof DraftFields, value: any) => {
    setDraft(prev => prev ? { ...prev, [field]: value } : prev);
    // Clear validation error for this field when user starts typing
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // Validate all fields
  const validate = useCallback((): boolean => {
    if (!draft) return false;
    const errors: Record<string, string> = {};

    // API URL validation
    const trimmedUrl = draft.apiUrl.trim();
    if (!trimmedUrl) {
      errors.apiUrl = t('profiles.validationUrlRequired');
    } else {
      try {
        const parsed = new URL(trimmedUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.apiUrl = t('profiles.validationUrlProtocol');
        }
      } catch {
        if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
          errors.apiUrl = t('profiles.validationUrlInvalid');
        }
      }
    }

    // API Key validation (only if noAuth is not checked)
    if (!draft.noAuth && !draft.apiKey.trim()) {
      errors.apiKey = t('profiles.validationKeyRequired');
    }

    // Model validation
    if (!draft.selectedModel.trim()) {
      errors.selectedModel = t('profiles.validationModelRequired');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [draft, t]);

  // Save handler
  const handleSave = useCallback(() => {
    if (!selectedProfileId || !draft) return;
    if (!validate()) {
      toast.error(t('profiles.validationFailed'));
      return;
    }

    // Update the store
    updateProfile(selectedProfileId, {
      apiType: draft.apiType,
      apiUrl: draft.apiUrl.trim(),
      apiKey: draft.apiKey.trim(),
      noAuth: draft.noAuth,
      customApiUrl: draft.customApiUrl,
      selectedModel: draft.selectedModel.trim(),
      systemPromptType: draft.systemPromptType,
    });

    toast.success(t('profiles.saved'));
  }, [selectedProfileId, draft, validate, updateProfile, t]);

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
    if (!draft) return;
    const isAuthValid = draft.noAuth || draft.apiKey;
    if (!draft.apiUrl || !isAuthValid) {
        toast.error(t('settings.requiredFields'));
        return;
    }
    setFetching(true);
    try {
      const fetched = await fetchModels(draft.apiUrl.trim(), draft.apiKey.trim(), draft.apiType);
      setModels(fetched);
      if (fetched.length > 0) {
        setDropdownOpen(true);
        toast.success(t('settings.modelsFetched', { count: fetched.length }));
        
        // Auto-clear if current is not in fetched
        const currentModel = draft.selectedModel.trim();
        if (currentModel && !fetched.some(m => m.id === currentModel)) {
          updateDraft('selectedModel', '');
          setTimeout(() => modelInputRef.current?.focus(), 100);
        }
      } else {
        toast.info(t('profiles.fetchModelsNone'));
      }
    } catch (err: any) {
      if (err.code === 'ERR_NETWORK' && !err.response) {
          toast.error(t('errors.corsMessage'), {
              description: t('errors.corsDescription'),
          });
      } else {
          toast.error(t('profiles.fetchModelsError'));
      }
    } finally {
      setFetching(false);
    }
  };

  const handleSelectModel = (m: string) => {
    updateDraft('selectedModel', m);
    setDropdownOpen(false);
  };

  const clearModel = () => {
    updateDraft('selectedModel', '');
  };

  const filteredModels = models.length > 0 && draft?.selectedModel
    ? models.filter(m => m.id.toLowerCase().includes(draft.selectedModel.toLowerCase()))
    : models;

  const selectedModelInfo = models.find(m => m.id === draft?.selectedModel);

  // Config MAX_TOKENS exceeds this model's limit → show row in red
  const modelExceedsLimit = (m: ModelInfo) => {
    const maxTokens = API_CONFIG.MAX_TOKENS
    if (m.contextWindow != null && maxTokens > m.contextWindow) return true
    if (m.outputTokenLimit != null && maxTokens > m.outputTokenLimit) return true
    return false
  }

  type SystemPromptOption = { value: SystemPromptType; label: string };
  const systemPromptOptions: SystemPromptOption[] = useMemo(() => (
    SYSTEM_PROMPT_OPTION_VALUES.map((value) => ({
      value,
      label: `${t(`profiles.systemPrompt${value.charAt(0).toUpperCase() + value.slice(1)}`)} · ${formatPromptSize(getSystemPromptLength(value))} ${t('profiles.context')}`,
    }))
  ), [t]);

  const systemPromptSelectStyles: StylesConfig<SystemPromptOption, false> = useMemo(() => ({
    control: (base, state) => ({
      ...base,
      minHeight: 42,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgb(39 39 42)' : 'white',
      borderColor: state.isFocused
        ? (isDark ? 'rgb(255 255 255)' : 'rgb(23 23 23)')
        : (isDark ? 'rgb(63 63 70)' : 'rgb(229 229 229)'),
      boxShadow: state.isFocused ? `0 0 0 1px ${isDark ? 'white' : 'rgb(23 23 23)'}` : 'none',
      '&:hover': {
        borderColor: state.isFocused ? (isDark ? 'white' : 'rgb(23 23 23)') : (isDark ? 'rgb(82 82 91)' : 'rgb(212 212 216)'),
      },
    }),
    singleValue: (base) => ({
      ...base,
      color: isDark ? 'rgb(212 212 216)' : 'rgb(64 64 64)',
    }),
    input: (base) => ({
      ...base,
      color: isDark ? 'rgb(212 212 216)' : 'rgb(64 64 64)',
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    menu: (base) => ({
      ...base,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgb(39 39 42)' : 'white',
      border: `1px solid ${isDark ? 'rgb(63 63 70)' : 'rgb(229 229 229)'}`,
      boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.2), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    }),
    menuList: (base) => ({
      ...base,
      padding: 4,
      maxHeight: 320,
      overflowY: 'auto' as const,
    }),
    option: (base, { isFocused, isSelected }) => ({
      ...base,
      backgroundColor: isSelected
        ? (isDark ? 'rgb(63 63 70)' : 'rgb(229 229 229)')
        : isFocused
          ? (isDark ? 'rgb(63 63 70)' : 'rgb(244 244 245)')
          : 'transparent',
      color: isDark ? 'rgb(212 212 216)' : 'rgb(38 38 38)',
      cursor: 'pointer',
      padding: '10px 12px',
      fontSize: 14,
    }),
    dropdownIndicator: (base) => ({
      ...base,
      color: isDark ? 'rgb(113 113 122)' : 'rgb(163 163 163)',
    }),
    indicatorSeparator: () => ({ display: 'none' }),
  }), [isDark]);

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
      apiUrl: 'http://127.0.0.1:11434',
      apiKey: '',
      noAuth: true,
      selectedModel: 'llama3.2',
      systemPromptType: 'medium',
    });
    
    setSelectedProfileId(newId);
    setShowMobileDetail(true);
    
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
        toast.error(t('profiles.emptyName'));
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

    confirmAction(
      t('profiles.deleteConfirmQuestion', { name: profileToDelete.name }),
      () => {
        deleteProfile(id);
        if (id === selectedProfileId) {
            const remaining = profiles.filter(p => p.id !== id);
            setSelectedProfileId(activeProfileId === id ? (remaining[0]?.id || null) : activeProfileId);
            setShowMobileDetail(false);
        }
        toast.success(t('profiles.deleteConfirm'));
      },
      {
        confirmText: t('profiles.delete'),
        cancelText: t('chat.cancel'),
        variant: 'destructive',
        title: t('profiles.delete')
      }
    );
  };

  // Helper to render validation error
  const renderError = (field: string) => {
    if (!validationErrors[field]) return null;
    return (
      <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">
        {validationErrors[field]}
      </p>
    );
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
        className="w-full h-full md:max-w-4xl md:h-[75vh] md:max-h-[900px] md:mx-4 border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 md:rounded-2xl flex overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Left Sidebar: Profile List */}
        <div className={`w-full md:w-1/3 border-r border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-900/50 flex-col ${showMobileDetail ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="font-semibold text-neutral-900 dark:text-white">{t('profiles.title')}</h2>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={startCreate} 
                    disabled={isCreating}
                    className="p-1.5 hover:bg-neutral-200 dark:hover:bg-zinc-800 rounded-md text-neutral-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('profiles.create')}
                  >
                      <Plus className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => onOpenChange(false)}
                    className="md:hidden p-1.5 hover:bg-neutral-200 dark:hover:bg-zinc-800 rounded-md text-neutral-500 dark:text-zinc-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  >
                      <X className="w-5 h-5" />
                  </button>
                </div>
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
                        onClick={() => {
                            if (!editingId) {
                                setSelectedProfileId(profile.id);
                                setShowMobileDetail(true);
                            }
                        }}
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
                                            toast.success(t('profiles.activeSet', { name: profile.name }));
                                        } else {
                                            toast.error(t('profiles.incomplete'));
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
                                    title={isValid ? t('profiles.setActiveProfile') : t('profiles.incompleteProfile')}
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
                              
                              <div className="flex items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  {/* Rename button */}
                                  <button 
                                      onClick={(e) => startEdit(profile.id, profile.name, e)}
                                      className="p-1.5 hover:bg-neutral-200 dark:hover:bg-zinc-800 text-neutral-400 dark:text-zinc-500 hover:text-neutral-900 dark:hover:text-white rounded-md transition-all mr-1"
                                      title={t('profiles.rename')}
                                  >
                                      <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  
                                  {/* Delete button */}
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
                );})}
                
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
        <div className={`flex-1 flex-col bg-neutral-100/30 dark:bg-zinc-950 ${showMobileDetail ? 'flex w-full' : 'hidden md:flex'}`}>
             <div className="p-4 border-b border-neutral-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowMobileDetail(false)}
                        className="md:hidden p-1 -ml-2 text-neutral-500 hover:text-neutral-900 dark:text-zinc-400 dark:hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="font-semibold text-neutral-900 dark:text-white">{t('profiles.settings')}</h2>
                </div>
                <button onClick={() => onOpenChange(false)} className="text-neutral-400 dark:text-zinc-500 hover:text-neutral-900 dark:hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                {selectedProfile && draft ? (
                    <div className="max-w-xl space-y-8">
                        {/* Status Banner */}
                        {(() => {
                            const isAuthValid = draft.noAuth || draft.apiKey?.trim();
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
                                            updateDraft('apiType', type);
                                            // Handle URL
                                            if (!draft.customApiUrl) {
                                                const defaultUrl = (API_CONFIG as any).DEFAULT_ENDPOINTS[type];
                                                updateDraft('apiUrl', defaultUrl);
                                            }
                                            // 🛡️ Handle Model: Auto-fill if empty
                                            const currentModel = draft.selectedModel.trim();
                                            if (!currentModel) {
                                              const defaultModel = type === 'ollama' ? API_CONFIG.DEFAULT_MODEL_OLLAMA : 
                                                                  type === 'gemini' ? API_CONFIG.DEFAULT_MODEL_GEMINI : 
                                                                  API_CONFIG.DEFAULT_MODEL_OPENAI;
                                              updateDraft('selectedModel', defaultModel);
                                            }
                                        }}
                                        className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                                            draft.apiType === type
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
                                         checked={draft.customApiUrl}
                                         onChange={(e) => {
                                             const isCustom = e.target.checked;
                                             updateDraft('customApiUrl', isCustom);
                                             if (!isCustom) {
                                                 const defaultUrl = (API_CONFIG as any).DEFAULT_ENDPOINTS[draft.apiType];
                                                 updateDraft('apiUrl', defaultUrl);
                                             }
                                         }}
                                         className="w-3 h-3 rounded border-neutral-400 dark:border-zinc-700 text-neutral-900 dark:text-white focus:ring-neutral-900 dark:focus:ring-white bg-transparent"
                                     />
                                 </label>
                              </div>
                              <input 
                                 value={draft.apiUrl}
                                 onChange={(e) => updateDraft('apiUrl', e.target.value)}
                                 disabled={!draft.customApiUrl}
                                 className={`w-full bg-white dark:bg-zinc-900 border rounded-lg px-4 py-2.5 text-sm font-mono text-neutral-700 dark:text-zinc-300 focus:outline-none transition-colors ${
                                   !draft.customApiUrl ? 'opacity-40 cursor-not-allowed border-neutral-200 dark:border-zinc-800' : 
                                   validationErrors.apiUrl ? 'border-red-400 dark:border-red-500 focus:border-red-500' : 'border-neutral-200 dark:border-zinc-800 focus:border-neutral-900 dark:focus:border-white'
                                 }`}
                             />
                             {renderError('apiUrl')}
                         </div>

                         <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                 <label className="text-xs font-medium text-neutral-500 dark:text-zinc-500 uppercase tracking-wider">{t('settings.apiKey')}</label>
                                 <label className="flex items-center gap-2 cursor-pointer group">
                                     <span className="text-[10px] text-neutral-400 dark:text-zinc-500 group-hover:text-neutral-600 dark:group-hover:text-zinc-300 transition-colors">{t('settings.noAuth')}</span>
                                     <input 
                                         type="checkbox"
                                         checked={draft.noAuth}
                                         onChange={(e) => updateDraft('noAuth', e.target.checked)}
                                         className="w-3 h-3 rounded border-neutral-400 dark:border-zinc-700 text-neutral-900 dark:text-white focus:ring-neutral-900 dark:focus:ring-white bg-transparent"
                                     />
                                 </label>
                              </div>
                              <div className="relative">
                                  <input 
                                     type={showApiKey ? "text" : "password"}
                                     value={draft.apiKey}
                                     onChange={(e) => updateDraft('apiKey', e.target.value)}
                                     placeholder={draft.noAuth ? t('settings.apiKeyPlaceholderNoAuth') : t('config.apiKeyPlaceholder')}
                                     disabled={draft.noAuth}
                                     className={`w-full bg-white dark:bg-zinc-900 border rounded-lg px-4 py-2.5 pr-10 text-sm font-mono text-neutral-700 dark:text-zinc-300 focus:outline-none transition-colors ${
                                       draft.noAuth ? 'opacity-40 cursor-not-allowed border-neutral-200 dark:border-zinc-800' :
                                       validationErrors.apiKey ? 'border-red-400 dark:border-red-500 focus:border-red-500' : 'border-neutral-200 dark:border-zinc-800 focus:border-neutral-900 dark:focus:border-white'
                                     }`}
                                 />
                                 {!draft.noAuth && (
                                     <button
                                         type="button"
                                         onClick={() => setShowApiKey(!showApiKey)}
                                         className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-zinc-500 hover:text-neutral-600 dark:group-hover:text-zinc-300 transition-colors"
                                     >
                                         {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                     </button>
                                 )}
                              </div>
                              {renderError('apiKey')}
                         </div>
                        
                         <div className="space-y-2">
                             <label className="text-xs font-medium text-neutral-500 dark:text-zinc-500 uppercase tracking-wider">{t('settings.model')}</label>
                             <div className="relative" ref={dropdownRef}>
                                <Box className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-zinc-500 z-10" />
                                <input 
                                    ref={modelInputRef}
                                    value={draft.selectedModel}
                                    onChange={(e) => {
                                        updateDraft('selectedModel', e.target.value);
                                        if (models.length > 0) setDropdownOpen(true);
                                    }}
                                    onFocus={() => {
                                        if (models.length > 0) setDropdownOpen(true);
                                    }}
                                    placeholder={t('profiles.modelIdPlaceholder')}
                                    className={`w-full bg-white dark:bg-zinc-900 border rounded-lg ${selectedModelInfo?.thinking ? 'pl-11' : 'pl-10'} pr-24 py-2.5 text-sm font-mono text-neutral-700 dark:text-zinc-300 focus:outline-none transition-colors ${
                                      validationErrors.selectedModel ? 'border-red-400 dark:border-red-500 focus:border-red-500' : 'border-neutral-200 dark:border-zinc-800 focus:border-neutral-900 dark:focus:border-white'
                                    }`}
                                />
                                
                                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    {draft.selectedModel && (
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
                                        disabled={fetching || !draft.apiUrl?.trim() || (!draft.noAuth && !draft.apiKey?.trim())}
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
                                        className="absolute top-full left-0 right-0 z-50 mt-1.5 max-h-80 overflow-y-auto rounded-lg border border-neutral-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
                                    >
                                        {filteredModels.map((m) => {
                                            const overLimit = modelExceedsLimit(m)
                                            return (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => handleSelectModel(m.id)}
                                            title={overLimit ? t('profiles.modelOverTokenLimit') : undefined}
                                            className={`w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-mono transition-colors cursor-pointer hover:bg-neutral-100 dark:hover:bg-zinc-800 ${m.id === draft.selectedModel
                                                ? 'text-neutral-900 dark:text-white bg-neutral-100 dark:bg-zinc-800/50'
                                                : 'text-neutral-500 dark:text-zinc-400'
                                            } ${overLimit ? '!text-red-600 dark:!text-red-400' : ''}`}
                                        >
                                            <div className="flex items-center gap-2.5 overflow-hidden">
                                                {m.id === draft.selectedModel ? (
                                                    <Check className="w-3 h-3 shrink-0 text-neutral-900 dark:text-white" />
                                                ) : (
                                                    <div className="w-3" />
                                                )}
                                                <span className="truncate">{m.id}</span>
                                            </div>
                                            {m.thinking && (
                                                <div title={t('settings.reasoningModel')}>
                                                    <Brain className="w-3 h-3 text-neutral-600 dark:text-neutral-400 shrink-0" />
                                                </div>
                                            )}
                                        </button>
                                            )
                                        })}
                                        {filteredModels.length === 0 && (
                                            <div className="px-3.5 py-2 text-xs text-zinc-500">{t('profiles.noModels')}</div>
                                        )}
                                    </motion.div>
                                    )}
                                </AnimatePresence>
                             </div>
                             {renderError('selectedModel')}
                            <p className="text-xs text-zinc-600">{t('profiles.modelHint')}</p>
                        </div>

                        {/* System Prompt Type */}
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-neutral-500 dark:text-zinc-500 uppercase tracking-wider">{t('profiles.systemPromptType')}</label>
                            <Select<SystemPromptOption, false>
                                value={systemPromptOptions.find((o) => o.value === draft.systemPromptType) ?? null}
                                options={systemPromptOptions}
                                onChange={(opt) => opt && updateDraft('systemPromptType', opt.value)}
                                styles={systemPromptSelectStyles}
                                isSearchable={false}
                                classNamePrefix="react-select-prompt"
                                placeholder=""
                                menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                                menuPosition="fixed"
                                menuPlacement="auto"
                            />
                            <p className="text-xs text-zinc-600 dark:text-zinc-500">{t('profiles.systemPromptHint')}</p>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-400 dark:text-zinc-500">
                        <User className="w-12 h-12 mb-4 opacity-20" />
                        <p>{t('profiles.noProfileSelected')}</p>
                    </div>
                )}
            </div>
            
            {/* Footer: Save button */}
            {selectedProfile && draft && (
              <div className="p-4 border-t border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-zinc-900/30">
                <button
                  onClick={handleSave}
                  disabled={!isDirty}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                    isDirty
                      ? 'bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-sm'
                      : 'bg-neutral-200 dark:bg-zinc-800 text-neutral-400 dark:text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  {t('profiles.save')}
                </button>
              </div>
            )}
        </div>
      </motion.div>
    </motion.div>
  );
};
