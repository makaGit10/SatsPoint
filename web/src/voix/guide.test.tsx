import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

const urls: Record<string, string | null> = {}
vi.mock('./useManifesteAudio', () => ({
  obtenirUrlAudio: vi.fn(async (cle: string) => urls[cle] ?? null),
  useUrlAudio: () => null,
  invaliderManifestes: () => undefined,
}))

const { guideCourant, oublierGuidesLus, useGuide, useGuideVocal } = await import('./guide')
const lecteur = await import('./lecteur')
const { useVoix } = await import('./store')

function Ecran({ cle, actif }: { cle: string; actif?: boolean }) {
  useGuideVocal(cle, { actif })
  return null
}

/** Laisse passer le délai d'arrivée sur l'écran et la résolution du manifeste. */
async function attendre() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
}

describe('useGuideVocal — guide vocal par écran', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    oublierGuidesLus()
    lecteur.arreter()
    useGuide.setState({ pile: [] })
    useVoix.setState({ langueAudio: 'wo', activee: true, cleEnLecture: null })
    urls['guide.caisse'] = 'https://exemple.test/audio/wo/guide.caisse.aaaa.mp3'
    urls['guide.ventes'] = 'https://exemple.test/audio/wo/guide.ventes.bbbb.mp3'
    // Premier geste (règle des navigateurs) : sans lui, rien n'est lu.
    fireEvent.pointerDown(window)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("lit le guide une seule fois par session et par langue, puis s'arrête en quittant l'écran", async () => {
    const ecran = render(<Ecran cle="guide.caisse" />)
    await attendre()
    expect(useVoix.getState().cleEnLecture).toBe('guide.caisse')

    ecran.unmount()
    expect(useVoix.getState().cleEnLecture).toBeNull()
    expect(guideCourant()).toBeNull()

    // Retour sur l'écran : pas de seconde lecture automatique dans la même session.
    render(<Ecran cle="guide.caisse" />)
    await attendre()
    expect(useVoix.getState().cleEnLecture).toBeNull()

    // Autre langue choisie : le guide est relu dans cette langue.
    act(() => useVoix.setState({ langueAudio: 'ff' }))
    await attendre()
    expect(useVoix.getState().cleEnLecture).toBe('guide.caisse')
  })

  it("ne lit rien quand l'aide vocale est coupée, mais déclare le guide de l'écran", async () => {
    useVoix.setState({ activee: false })
    render(<Ecran cle="guide.caisse" />)
    await attendre()
    expect(useVoix.getState().cleEnLecture).toBeNull()
    expect(guideCourant()).toBe('guide.caisse')
  })

  it('attend la fin du son en cours (jamais deux audios superposés)', async () => {
    useVoix.setState({ cleEnLecture: 'langue.wo' })
    render(<Ecran cle="guide.caisse" />)
    await attendre()
    expect(useVoix.getState().cleEnLecture).toBe('langue.wo')
    act(() => useVoix.setState({ cleEnLecture: null }))
    await attendre()
    expect(useVoix.getState().cleEnLecture).toBe('guide.caisse')
  })

  it("une fenêtre ouverte passe devant la page ; inactive, elle n'est pas déclarée", async () => {
    const { rerender } = render(
      <>
        <Ecran cle="guide.ventes" />
        <Ecran cle="guide.venteDetail" actif={false} />
      </>,
    )
    expect(guideCourant()).toBe('guide.ventes')
    rerender(
      <>
        <Ecran cle="guide.ventes" />
        <Ecran cle="guide.venteDetail" actif />
      </>,
    )
    expect(guideCourant()).toBe('guide.venteDetail')
    await attendre()
  })
})
