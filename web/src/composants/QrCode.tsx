import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { Squelette } from './Squelette'

export interface PropsQrCode {
  valeur: string
  /** Libellé accessible (le QR est une image). */
  libelle: string
  taille?: number
  className?: string
}

/**
 * Code QR généré côté client (bibliothèque `qrcode`, chargée à la demande), rendu en SVG net,
 * toujours sur fond blanc (lisible par les lecteurs quel que soit le thème).
 */
export function QrCode({ valeur, libelle, taille = 240, className }: PropsQrCode) {
  const [rendu, setRendu] = useState<{ valeur: string; svg: string } | null>(null)
  // Dérivé au rendu : un SVG n'est affiché que s'il correspond à la valeur courante (sinon squelette).
  const svg = rendu && rendu.valeur === valeur ? rendu.svg : null

  useEffect(() => {
    let actif = true
    import('qrcode')
      .then((m) => m.toString(valeur, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }))
      .then((svgRendu) => {
        if (actif) setRendu({ valeur, svg: svgRendu })
      })
      .catch(() => {
        if (actif) setRendu({ valeur, svg: '' })
      })
    return () => {
      actif = false
    }
  }, [valeur])

  return (
    <div
      role="img"
      aria-label={libelle}
      data-qr={svg ? 'pret' : 'chargement'}
      className={cn('inline-flex items-center justify-center rounded-xl border border-verre-bordure bg-white p-4 shadow-verre', className)}
      style={{ width: taille, height: taille }}
    >
      {svg ? (
        <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <Squelette className="h-full w-full rounded-sm" />
      )}
    </div>
  )
}
