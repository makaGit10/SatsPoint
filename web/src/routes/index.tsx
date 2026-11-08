import { createBrowserRouter, Navigate } from 'react-router-dom'
import {
  Accueil,
  Articles,
  Caisse,
  Connexion,
  Console,
  Coquille,
  Demarrage,
  DeuxFacteurs,
  Equipe,
  Inscription,
  Introuvable,
  Invitation,
  Langue,
  MotDePasseOublie,
  Paiement,
  Portefeuille,
  Recu,
  Reglages,
  Reinitialisation,
  StudioAudio,
  TableauDeBord,
  Ventes,
  VerificationDeuxFacteurs,
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
          // Écran de paiement plein écran (hors coquille : ni barre latérale ni barre du bas).
          {
            element: <RequiertBoutique />,
            children: [{ path: '/caisse/paiement/:ulid', element: <Paiement /> }],
          },
          // Code de double authentification après connexion (hors coquille).
          { path: '/verification-2fa', element: <VerificationDeuxFacteurs /> },
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
              // Sécurité du compte (tous les comptes ; obligatoire pour le super-admin).
              { path: '/securite/2fa', element: <DeuxFacteurs /> },
              {
                element: <RequiertSuperAdmin />,
                children: [
                  { path: '/admin', element: <Console /> },
                  { path: '/admin/studio', element: <StudioAudio /> },
                  { path: '/admin/studio-audio', element: <Navigate to="/admin/studio" replace /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '/r/:jeton', element: <Recu /> },
      // Invitation à rejoindre une boutique : publique, connexion ou inscription puis acceptation.
      { path: '/invitation/:jeton', element: <Invitation /> },
      { path: '*', element: <Introuvable /> },
    ],
  },
])
