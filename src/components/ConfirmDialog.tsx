import { motion, AnimatePresence } from 'motion/react'
import { AlertTriangle, Check } from 'lucide-react'
import { useConfirmStore } from '../store/useConfirmStore'

export default function ConfirmDialog() {
  const { isOpen, title, message, confirmText, cancelText, variant, icon, onConfirm, onCancel, closeConfirm } = useConfirmStore();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={closeConfirm}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-neutral-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
              variant === 'destructive' 
                ? 'bg-red-100 dark:bg-red-900/20' 
                : 'bg-neutral-100 dark:bg-zinc-900'
            }`}>
              {icon ? (
                <div className={variant === 'destructive' ? "text-red-600 dark:text-red-500" : "text-neutral-900 dark:text-white"}>
                  {icon}
                </div>
              ) : variant === 'destructive' ? (
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-500" />
              ) : (
                <Check className="w-6 h-6 text-neutral-900 dark:text-white" />
              )}
            </div>
            
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
              {title || 'Confirm Action'}
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {message}
            </p>
          </div>

          <div className="p-4 bg-neutral-50 dark:bg-zinc-900/50 border-t border-neutral-200 dark:border-zinc-800 flex gap-3">
            <button
              onClick={() => {
                onCancel();
                closeConfirm();
              }}
              className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-zinc-700 text-sm font-medium text-neutral-700 dark:text-zinc-300 hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                closeConfirm();
              }}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-lg shadow-black/5 transition-all active:scale-[0.98] ${
                variant === 'destructive'
                  ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500'
                  : 'bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
