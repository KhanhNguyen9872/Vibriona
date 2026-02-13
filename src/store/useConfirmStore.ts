import { create } from 'zustand'

interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
  onCancel?: () => void
}

interface ConfirmState {
  isOpen: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  variant: 'default' | 'destructive'
  onConfirm: () => void
  onCancel: () => void
  openConfirm: (
    message: string,
    onConfirm: () => void,
    options?: ConfirmOptions
  ) => void
  closeConfirm: () => void
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'default',
  onConfirm: () => {},
  onCancel: () => {},
  openConfirm: (message, onConfirm, options = {}) => {
    set({
      isOpen: true,
      message,
      onConfirm,
      title: options.title || 'Confirm Action',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      variant: options.variant || 'default',
      onCancel: options.onCancel || (() => {}),
    });
  },
  closeConfirm: () => set({ isOpen: false }),
}))
