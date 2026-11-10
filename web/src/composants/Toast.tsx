import * as ToastPrimitive from '@radix-ui/react-toast'
import { CircleAlert, CircleCheck, Clock, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'
import { useToasts, type TypeToast } from './toastStore'

const ICONES: Record<TypeToast, ReactNode> = {
  succes: <CircleCheck className="text-succes" />,
  erreur: <CircleAlert className="text-danger" />,
  info: <Info className="text-mm" />,
  attente: <Clock className="text-attente" />,
}

const BORDURES: Record<TypeToast, string> = {
  succes: 'border-l-succes',
  erreur: 'border-l-danger',
  info: 'border-l-mm',
  attente: 'border-l-attente',
}

/** Conteneur global des notifications (à monter une fois). */
export function Toasts() {
  const { t } = useTranslation()
  const toasts = useToasts((s) => s.toasts)
  const retirer = useToasts((s) => s.retirer)

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {toasts.map((toast) => (
        <ToastPrimitive.Root
          key={toast.id}
          duration={toast.duree ?? (toast.type === 'erreur' ? 8000 : 5000)}
          onOpenChange={(ouvert) => {
            if (!ouvert) retirer(toast.id)
          }}
          className={cn(
            'anim-glisser-droite verre-fort pointer-events-auto flex w-full items-start gap-3 rounded-xl border-l-4 p-4 shadow-lg',
            'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:translate-x-full data-[swipe=end]:opacity-0 data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
            BORDURES[toast.type],
          )}
        >
          <span className="mt-0.5 inline-flex shrink-0 [&>svg]:size-[18px]" aria-hidden="true">
            {ICONES[toast.type]}
          </span>
          <div className="min-w-0 flex-1">
            <ToastPrimitive.Title className="text-sm font-semibold text-texte">{toast.titre}</ToastPrimitive.Title>
            {toast.description && <ToastPrimitive.Description className="mt-0.5 text-sm text-texte-2">{toast.description}</ToastPrimitive.Description>}
          </div>
          {toast.voix && <HautParleur cle={toast.voix} />}
          <ToastPrimitive.Close
            aria-label={t('commun.fermer')}
            className="zone-tactile -mt-1 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-texte-3 hover:bg-surface-2 hover:text-texte"
          >
            <X size={14} aria-hidden="true" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="pointer-events-none fixed top-2 right-2 left-2 z-[60] flex flex-col gap-2 outline-none md:top-auto md:right-4 md:bottom-4 md:left-auto md:w-[360px]" />
    </ToastPrimitive.Provider>
  )
}
