import { Camera } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialogue } from '@/composants/Dialogue'
import { EtatVide } from '@/composants/EtatVide'
import { nettoyerCodeScanne } from './utilitaires'

interface DetecteurCodes {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
}
type ConstructeurDetecteur = new (options?: { formats?: string[] }) => DetecteurCodes

function obtenirDetecteur(): ConstructeurDetecteur | null {
  const w = window as unknown as { BarcodeDetector?: ConstructeurDetecteur }
  return typeof w.BarcodeDetector === 'function' ? w.BarcodeDetector : null
}

export interface PropsScanner {
  ouvert: boolean
  onFermer: () => void
  onCode: (valeur: string) => void
}

/** Scan d'un QR via la caméra (`BarcodeDetector`) ; sinon, invite à coller le code. */
export function Scanner({ ouvert, onFermer, onCode }: PropsScanner) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)
  // Capacité de l'appareil : connue dès le départ (pas de `BarcodeDetector` ou pas de caméra → saisie manuelle).
  const [indisponible, setIndisponible] = useState(() => !obtenirDetecteur() || !navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    if (!ouvert || indisponible) return
    const Detecteur = obtenirDetecteur()
    if (!Detecteur) return
    let actif = true
    let flux: MediaStream | null = null
    let minuterie: ReturnType<typeof setInterval> | null = null
    const detecteur = new Detecteur({ formats: ['qr_code'] })

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((f) => {
        if (!actif) {
          f.getTracks().forEach((p) => p.stop())
          return
        }
        flux = f
        if (video.current) {
          video.current.srcObject = f
          void video.current.play().catch(() => undefined)
        }
        minuterie = setInterval(async () => {
          if (!actif || !video.current || video.current.readyState < 2) return
          try {
            const codes = await detecteur.detect(video.current)
            const premier = codes[0]?.rawValue
            if (premier && actif) {
              actif = false
              onCode(nettoyerCodeScanne(premier))
            }
          } catch {
            /* image non prête */
          }
        }, 300)
      })
      .catch(() => {
        if (actif) setIndisponible(true)
      })

    return () => {
      actif = false
      if (minuterie) clearInterval(minuterie)
      flux?.getTracks().forEach((p) => p.stop())
    }
  }, [ouvert, indisponible, onCode])

  return (
    <Dialogue ouvert={ouvert} onOuvertChange={(o) => !o && onFermer()} titre={t('portefeuille.scanner')} taille="sm">
      <div className="pb-2">
        {indisponible ? (
          <EtatVide ton="neutre" icone={<Camera />} titre={t('portefeuille.cameraIndisponible')} className="py-6" />
        ) : (
          <video ref={video} muted playsInline className="aspect-square w-full rounded-lg bg-surface-3 object-cover" aria-label={t('portefeuille.scanner')} />
        )}
      </div>
    </Dialogue>
  )
}
