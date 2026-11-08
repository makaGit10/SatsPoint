import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { definirElementAudio } from './lecteur'
import { useVoix } from './store'

/**
 * Lecteur global : un seul élément <audio> pour toute l'application, et une zone `aria-live`
 * discrète qui signale la lecture aux lecteurs d'écran.
 */
export function LecteurAudio() {
  const ref = useRef<HTMLAudioElement>(null)
  const cleEnLecture = useVoix((s) => s.cleEnLecture)
  const { t } = useTranslation()

  useEffect(() => {
    definirElementAudio(ref.current)
  }, [])

  return (
    <>
      <audio ref={ref} preload="none" aria-hidden="true" tabIndex={-1} />
      <span className="sr-only" aria-live="polite">
        {cleEnLecture ? t('voix.lectureEnCours') : ''}
      </span>
    </>
  )
}
