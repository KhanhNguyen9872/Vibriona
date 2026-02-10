import { toast } from 'sonner'

/**
 * Show a Sonner confirmation toast with action/cancel buttons.
 * Replaces native `window.confirm()`.
 */
export interface ConfirmOptions {
  confirm?: string
  cancel?: string
  description?: string
}

export function confirmAction(
  message: string,
  onConfirm: () => void,
  options: ConfirmOptions = {},
) {
  const confirmLabel = options.confirm || 'OK'
  const cancelLabel = options.cancel || 'Cancel'
  const description = options.description
  toast(message, {
    description,
    duration: 5000,
    action: {
      label: confirmLabel,
      onClick: onConfirm,
    },
    cancel: {
      label: cancelLabel,
      onClick: () => toast.dismiss(),
    },
  })
}
