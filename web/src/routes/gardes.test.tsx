import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import type { EtatDeuxFa, Utilisateur } from '@/api/types'
import { deuxFaAActiver, deuxFaAValider, useAuth } from '@/auth/store'
import { RequiertSession, RequiertSuperAdmin } from './gardes'

const SUPER: Utilisateur = {
  ulid: 'S1',
  nom: 'Super',
  email: 'super@demo.test',
  telephone: null,
  role_plateforme: 'super_admin',
  preferences: { locale: 'fr', langue_audio: null, theme: 'clair', aide_vocale: false },
  boutique: null,
}

function Emplacement() {
  const l = useLocation()
  return <p data-testid="ici">{`${l.pathname}${l.search}`}</p>
}

function naviguer(chemin: string, deuxFa: EtatDeuxFa | undefined, base: Utilisateur = SUPER) {
  useAuth.getState().definir({ ...base, ...(deuxFa ? { deux_fa: deuxFa } : {}) })
  render(
    <MemoryRouter initialEntries={[chemin]}>
      <Routes>
        <Route element={<RequiertSession />}>
          <Route element={<RequiertSuperAdmin />}>
            <Route path="/admin/studio" element={<p>studio</p>} />
          </Route>
          <Route path="/securite/2fa" element={<Emplacement />} />
          <Route path="/verification-2fa" element={<Emplacement />} />
          <Route path="/caisse" element={<p>caisse</p>} />
        </Route>
        <Route path="*" element={<Emplacement />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuth.getState().effacer()
})

describe('garde de double authentification', () => {
  it('super-admin sans 2FA → activation, avec retour vers la page demandée', () => {
    naviguer('/admin/studio', { active: false, requise: true, validee: false })
    expect(screen.getByTestId('ici')).toHaveTextContent('/securite/2fa?suite=%2Fadmin%2Fstudio')
  })

  it('état 2FA absent (ancienne réponse) → refus par défaut : activation', () => {
    naviguer('/admin/studio', undefined)
    expect(screen.getByTestId('ici').textContent).toMatch(/^\/securite\/2fa/)
  })

  it('2FA active mais non validée → vérification du code', () => {
    naviguer('/admin/studio', { active: true, requise: true, validee: false })
    expect(screen.getByTestId('ici').textContent).toMatch(/^\/verification-2fa\?suite=/)
  })

  it('2FA validée → la console s’ouvre', () => {
    naviguer('/admin/studio', { active: true, requise: true, validee: true })
    expect(screen.getByText('studio')).toBeInTheDocument()
  })

  it('un commerçant avec 2FA active doit aussi valider son code', () => {
    const proprio: Utilisateur = { ...SUPER, role_plateforme: null, boutique: { ulid: 'B', nom: 'B', ville: 'Dakar', devise: 'XOF', role: 'proprietaire', configuration: { wallet: true, paytech: true, paiement_test: true } } }
    naviguer('/caisse', { active: true, requise: false, validee: false }, proprio)
    expect(screen.getByTestId('ici')).toHaveTextContent('/verification-2fa?suite=%2Fcaisse')
  })

  it('aides', () => {
    expect(deuxFaAActiver({ ...SUPER, deux_fa: { active: false, requise: true, validee: false } })).toBe(true)
    expect(deuxFaAValider({ ...SUPER, deux_fa: { active: true, requise: true, validee: false } })).toBe(true)
    expect(deuxFaAValider({ ...SUPER, deux_fa: { active: true, requise: true, validee: true } })).toBe(false)
  })
})
