import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLE_CONFIG } from '@/api/config'
import type { Config } from '@/api/types'
import { useAuth } from '@/auth/store'
import { LANGUES_REPLI } from '@/lib/catalogue'
import { queryClient } from '@/lib/queryClient'
import { useVoix } from '@/voix/store'
import Langue from './Langue'

const CONFIG: Config = {
  app: { nom: 'SatsPoint', env: 'testing', demo: true, version: 'test' },
  reverb: { cle: 'x', hote: 'localhost', port: 8125, schema: 'http' },
  locales: ['fr', 'en'],
  langues_audio: [],
  pays: [
    { code: 'SN', nom_fr: 'Sénégal', nom_en: 'Senegal', indicatif: '+221' },
    { code: 'CI', nom_fr: "Côte d'Ivoire", nom_en: "Côte d'Ivoire", indicatif: '+225' },
  ],
  langues: [...LANGUES_REPLI, { code: 'dyu', nom_local: 'Jula', nom_fr: 'Dioula', nom_en: 'Dyula', pays: ['CI'], ordre: 6 }],
}

function afficher() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Langue />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return within(screen.getByRole('list', { name: 'Choisissez votre langue' }))
}

describe('écran de choix de la langue : pays puis langues du pays', () => {
  beforeEach(() => {
    useAuth.setState({ utilisateur: null, statut: 'anonyme' })
    useVoix.setState({ pays: null, langueAudio: null })
    queryClient.setQueryData(CLE_CONFIG, CONFIG)
  })
  afterEach(() => {
    queryClient.clear()
    window.localStorage.clear()
  })

  it('Sénégal par défaut : les mêmes six tuiles qu’avant', () => {
    const tuiles = afficher()
    expect(tuiles.getAllByRole('button').map((b) => b.textContent)).toEqual(['Wolofwo', 'Seereersrr', 'Pulaarff', 'Jooladyo', 'Françaisfr', 'Englishen'])
  })

  it('choisir un autre pays affiche ses langues (noms venus du catalogue) + Français + English', () => {
    afficher()
    fireEvent.change(screen.getByRole('combobox', { name: 'Votre pays' }), { target: { value: 'CI' } })
    const tuiles = within(screen.getByRole('list', { name: 'Choisissez votre langue' }))
    expect(tuiles.getAllByRole('button').map((b) => b.textContent)).toEqual(['Juladyu', 'Françaisfr', 'Englishen'])
    expect(useVoix.getState().pays).toBe('CI')
  })

  it('le choix d’une langue ajoutée active l’aide vocale et mémorise le pays', () => {
    useVoix.setState({ pays: 'CI' })
    const tuiles = afficher()
    fireEvent.click(tuiles.getByRole('button', { name: /Jula/ }))
    expect(useVoix.getState().langueAudio).toBe('dyu')
    expect(useVoix.getState().activee).toBe(true)
    expect(useVoix.getState().pays).toBe('CI')
  })
})
