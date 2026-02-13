import type { ReactNode } from 'react'
import { useConfirmStore } from '../store/useConfirmStore' // Ensure path is correct based on alias config

/**
 * Show a confirmation dialog.
 * Replaces native `window.confirm()` and Sonner toast implementation.
 */
export interface ConfirmOptions {
  description?: string // Legacy support: mapped to message if message arg is title, but here message is main text
  title?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
  icon?: ReactNode
}

export function confirmAction(
  message: string,
  onConfirm: () => void,
  options: ConfirmOptions = {},
) {
  useConfirmStore.getState().openConfirm(message, onConfirm, {
    title: options.title,
    confirmText: options.confirmText,
    cancelText: options.cancelText,
    variant: options.variant,
    icon: options.icon,
  })
}
