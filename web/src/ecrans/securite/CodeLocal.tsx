import { useQuery } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { http } from '@/api/client'
import { useConfig } from '@/api/config'
import { Bouton } from '@/composants/Bouton'

/**
 * Double authentification « virtuelle » du poste de développement : en environnement LOCAL seulement, l'API
 * donne le code du moment (GET /auth/2fa/code-local, route absente en production) et on propose de le remplir.
 * Ailleurs ce composant ne rend rien et n'envoie aucune requête.
 */
export function CodeLocal({ onRemplir, actif = true }: { onRemplir: (code: string) => void; actif?: boolean }) {
  const { t } = useTranslation()
  const { data: config } = useConfig()
  const local = config?.app.env === 'local' && !config.app.demo
  const requete = useQuery({
    queryKey: ['deux-fa', 'code-local'],
    queryFn: () => http.get<{ code: string }>('/auth/2fa/code-local'),
    enabled: local && actif,
    retry: false,
    // Le code change toutes les 30 s.
    refetchInterval: 10_000,
    staleTime: 0,
  })
  const code = requete.data?.code
  if (!local || !actif || !code) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-accent-trait/60 bg-accent-doux px-3 py-2.5" data-code-local>
      <span className="flex min-w-0 items-center gap-2 text-sm text-texte-2">
        <FlaskConical size={16} className="shrink-0 text-accent-texte" aria-hidden="true" />
        <span className="min-w-0">
          {t('deuxFa.codeLocal.texte')} <b className="tabulaire text-base tracking-widest text-texte">{code}</b>
        </span>
      </span>
      <Bouton type="button" variante="secondaire" taille="sm" voix="deuxFa.codeLocal.remplir" onClick={() => onRemplir(code)}>
        {t('deuxFa.codeLocal.remplir')}
      </Bouton>
    </div>
  )
}
