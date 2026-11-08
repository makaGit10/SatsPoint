import { createBrowserRouter } from 'react-router-dom'
import {
  Accueil,
  Articles,
  Caisse,
  Connexion,
  Console,
  Coquille,
  Demarrage,
  Equipe,
  Inscription,
  Introuvable,
  Langue,
  MotDePasseOublie,
  Portefeuille,
  Recu,
  Reglages,
  Reinitialisation,
  StudioAudio,
  TableauDeBord,
  Ventes,
} from './ecrans'
import { Aiguillage, RequiertBoutique, RequiertInvite, RequiertRole, RequiertSession, RequiertSuperAdmin } from './gardes'
import { ErreurRacine, Racine } from './Racine'

export const routeur = createBrowserRouter([
  {
    element: <Racine />,
    errorElement: <ErreurRacine />,
    children: [
      { path: '/', element: <Aiguillage /> },
      { path: '/langue', element: <Langue /> },
      {
        element: <RequiertInvite />,
        children: [
          { path: '/accueil', element: <Accueil /> },
          { path: '/connexion', element: <Connexion /> },
          { path: '/inscription', element: <Inscription /> },
          { path: '/mot-de-passe/oubli', element: <MotDePasseOublie /> },
          { path: '/mot-de-passe/reinitialisation', element: <Reinitialisation /> },
        ],
      },
      {
        element: <RequiertSession />,
        children: [
          {
            element: <Coquille />,
            children: [
              {
                element: <RequiertBoutique />,
                children: [
                  { path: '/caisse', element: <Caisse /> },
                  { path: '/ventes', element: <Ventes /> },
                  { path: '/tableau-de-bord', element: <TableauDeBord /> },
                  { path: '/articles', element: <Articles /> },
                  { path: '/demarrage', element: <Demarrage /> },
                  {
                    element: <RequiertRole roles={['proprietaire', 'gerant']} />,
                    children: [
                      { path: '/portefeuille', element: <Portefeuille /> },
                      { path: '/equipe', element: <Equipe /> },
                      { path: '/reglages', element: <Reglages /> },
                    ],
                  },
                ],
              },
              {
                element: <RequiertSuperAdmin />,
                children: [
                  { path: '/admin', element: <Console /> },
                  { path: '/admin/studio-audio', element: <StudioAudio /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '/r/:jeton', element: <Recu /> },
      { path: '*', element: <Introuvable /> },
    ],
  },
])
