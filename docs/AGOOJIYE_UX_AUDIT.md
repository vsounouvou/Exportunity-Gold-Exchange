# Audit UX AGOOJIYE

Date de revue : 27 juillet 2026

## Objectif

Vérifier que chaque public peut accomplir sa tâche sans ambiguïté :

- voyageur ;
- client souhaitant réserver un bus entier ;
- visiteur demandant une démonstration ou une offre de flotte ;
- nouveau membre invité ;
- collaborateur ;
- responsable de département ;
- contrôleur d'embarquement ;
- administrateur mobilité ;
- administrateur et super-administrateur de l'équipe.

## Ce que les utilisateurs vont aimer

1. **Une identité forte et cohérente.** Le noir, l'or, les visuels du bus et
   l'ancrage béninois différencient immédiatement AGOOJIYE d'une billetterie
   générique.
2. **Une promesse compréhensible.** Le voyageur voit un trajet, un prix en
   FCFA, les places restantes et une action d'achat claire.
3. **Un parcours complet.** Recherche, choix du voyage, siège, passager,
   paiement de démonstration, confirmation, QR et recherche de réservation
   forment une expérience réelle.
4. **Des usages commerciaux distincts.** Acheter une place, réserver un bus,
   demander une démonstration et commander une flotte ne sont pas mélangés.
5. **Une expérience 3D utile.** Le bus peut être exploré sur mobile sans
   charger la bibliothèque 3D sur les autres pages.
6. **Un espace équipe contextualisé.** Les modules et données visibles
   dépendent du rôle. L'assistant conserve une identité unique :
   `AGOOJIYE — Assistant IA`.
7. **Des actions administratives plus sûres.** Une modification de statut est
   préparée puis enregistrée explicitement ; elle n'est plus déclenchée au
   simple changement d'une liste.

## Ce qui aurait provoqué un rejet

| Friction observée | Pourquoi elle est grave | Correction |
| --- | --- | --- |
| CTA mobile fixe au-dessus des boutons de formulaire, du plan de sièges, du paiement, du billet et de la 3D | Empêche l'action principale et donne l'impression d'un site non testé sur téléphone | CTA masqué sur les pages transactionnelles et outils |
| Conservation de la position de défilement entre deux étapes | La nouvelle page semble commencer au milieu de son contenu | Retour automatique en haut à chaque navigation |
| E-mail et téléphone demandés deux fois | Fatigue et peur de faire une erreur | Contact du passager principal réutilisé par défaut |
| Absence de retour pendant la recherche ou l'envoi | L'utilisateur clique plusieurs fois ou abandonne | États de chargement, erreurs et libellés contextuels |
| Plusieurs noms d'assistants visibles | Confusion sur l'identité, l'autorité et la confidentialité | Une seule identité visible dans l'interface, les notifications et la documentation |
| Recherche IA trop large sur les projets | Risque de montrer des informations hors département | Filtrage par département, adhésion projet, niveau de confidentialité et participation |
| Cache conservé lors d'un changement de compte | Un collaborateur pouvait voir brièvement l'ancien rôle et ses modules après une reconnexion sans recharger la page | Cache utilisateur vidé à la connexion et à la déconnexion, puis scénario de changement de rôle validé |
| Refus d'accès générique ou boucle de chargement | Un membre ne comprend pas si l'accès est interdit ou si l'application est en panne | États explicites en français pour les accès refusés et manifestes minimaux pour les contrôleurs |
| Question naturelle mal comprise par l'assistant | Une demande simple en français pouvait manquer le bon partenaire ou projet | Classement lexical français, contexte réduit aux autorisations et réponse IA gouvernée avec repli contrôlé |
| Manifeste trop riche pour le contrôle | Une fuite de coordonnées ou de jetons serait disproportionnée au besoin d'embarquement | Manifeste authentifié limité au nom, à la référence, au siège et au statut |
| Caméra noire affichée avant son activation | Écran inquiétant et gaspillage d'espace sur tablette | Vidéo masquée avant usage, démarrage/arrêt explicites et saisie manuelle conservée |
| Manifeste sans recherche | Contrôle lent lors d'un embarquement chargé | Recherche par passager, réservation ou billet |
| Panneau du contrôleur trop large sur téléphone | Les champs et le manifeste provoquaient un défilement horizontal | Contraintes de largeur corrigées et contrôle visuel à 390 x 844 |
| Colonnes et statuts administratifs en anglais | Charge cognitive et manque de finition | Libellés et valeurs métier en français |
| E-mails et statuts interprétés comme des dates | Données illisibles dans l'administration mobilité | Liste fermée de champs réellement datés |
| Deux administrations sans passerelle | L'administrateur ne sait pas où gérer l'équipe ou l'exploitation | Liens réciproques entre administration équipe et mobilité |
| Liens internes rechargeant toute l'application | L'équipe revoyait un long écran de chargement entre deux modules | Navigation interne convertie en navigation monopage, sans perte de session |
| Action approuvée encore présentée comme bloquée | Le super-administrateur ne sait pas si son approbation a été prise en compte | Libellé distinct entre approbation et exécution, toutes deux tracées |
| Invitation réduite à un formulaire de mot de passe | Accueil froid et absence de repères | Présentation de l'accompagnement AGOOJIYE et rappel de la validation humaine |

## Matrice de validation

| Persona | Parcours vérifié ou couvert | État |
| --- | --- | --- |
| Voyageur mobile | Recherche, voyage, siège, passager, paiement, billet, récupération | Parcours complet vérifié, réservation de contrôle nettoyée après audit |
| Client commercial | Réserver un bus, démonstration, commande, liste prioritaire | Pages et formulaires vérifiés sur mobile et bureau ; persistance couverte par les tests ciblés |
| Nouveau membre | Invitation, identité AGOOJIYE, autorité humaine | Scénario Playwright validé en production |
| Collaborateur | Priorités, assistant personnel, restrictions CRM/mobilité | Scénario Playwright validé en production |
| Responsable | Contexte départemental, équipe, CRM et mobilité autorisés | Scénario Playwright validé en production |
| Contrôleur | Validation, doublon, recherche manifeste, caméra | Scénario Playwright validé en production, hors caméra physique |
| Administrateur mobilité | Données lisibles, recherche, export, changement de statut confirmé | Scénario Playwright validé en production |
| Super-administrateur | Pilotage, assistant unique, synthèse et gouvernance | Scénario Playwright validé en production, avec données isolées de test |

## Critères de réussite visuelle

- aucune action importante masquée sur 390 x 844 ;
- aucun débordement horizontal incohérent ;
- aucun nom d'assistant concurrent visible ;
- aucun statut métier brut en anglais dans les vues principales ;
- retour visible pour tout chargement, erreur ou enregistrement ;
- passage clair entre site public, contrôle, administration mobilité et équipe ;
- toutes les actions sensibles présentées comme soumises à validation humaine.

## Vérifications techniques

Validées :

- compilation TypeScript complète réussie ;
- 38 tests ciblés de rôles, mobilité, billetterie, gouvernance et assistant réussis ;
- build de production et contrôle qualité marketing réussis ;
- 7 scénarios Playwright multi-rôles réussis sur `https://agoojiye.com` ;
- 18 contrôles Playwright des pages publiques réussis sur mobile et bureau ;
- rendu 3D non vide, cadré et interactif validé sur mobile, tablette et bureau ;
- version client et serveur identique : `7e03f0356e19`, build `1785152779683` ;
- appels de l'assistant déclenchés uniquement par l'utilisateur, en lecture seule,
  avec limitation de débit, délais, contexte minimal et repli
  OpenAI → Anthropic → réponse locale ;
- appel IA de production vérifié avec OpenAI
  (`gpt-4o-mini-2024-07-18`), sans repli, et journal ne contenant que des
  empreintes SHA-256 de l'entrée et de la sortie, pas la question brute ;
- approbation d'une action sensible refusée à l'administrateur de tenant puis
  acceptée par le super-administrateur, sans exécution implicite ;
- première validation de billet acceptée, deuxième validation refusée comme
  doublon, puis données de contrôle supprimées ;
- aucun débordement horizontal du contrôleur mobile et aucune erreur de console
  observée dans les interfaces contrôleur, administrateur et équipe ;
- navigation vers `Équipes` validée sans rechargement complet ni écran
  `Chargement…` ;
- webmail propre à AGOOJIYE vérifié sur `https://mail.agoojiye.com/` ;
- tenant de production isolé : `3162 / agoojye` ;
- sauvegarde préalable :
  `/var/backups/db/agoojye/pre-backoffice-ai-audit-20260727-090925.dump`,
  SHA-256
  `208c2347a7d26e45ad6b80d3da6322fcf325a62518c47ab6ba50689410a9af8e` ;
- quatre comptes et profils QA, leurs sessions MFA, le bus, la réservation,
  le paiement, le billet, les validations et les objets de travail isolés ont
  été supprimés transactionnellement ; les six comptes réels sont inchangés ;
- traces de sécurité et d'audit conservées après anonymisation des références
  utilisateur ;
- correctifs livrés par les commits `bc2ef90`, `1a49667` et `7e03f03`.

L'environnement Playwright embarqué a initialement échoué avant navigation à
cause de sa bibliothèque ICU locale. Le même jeu de tests a été relancé avec le
canal Chrome installé (`E2E_CHROME_CHANNEL=chrome`) et les 7 scénarios ont
réussi ; ce défaut ne concernait ni AGOOJIYE ni le serveur de production.

Contrôles physiques à programmer avec l'équipe :

- confirmer la caméra sur un téléphone disposant de `BarcodeDetector` ;
- parcourir les rôles protégés avec les comptes MFA réels, sans contourner
  l'authentification.

## Risques restant explicitement assumés

- le paiement reste un fournisseur de démonstration tant qu'un prestataire réel
  et ses webhooks ne sont pas configurés ;
- le modèle 3D procédural reste un visuel de remplacement, pas un modèle
  d'ingénierie homologué ;
- la consultation limitée du manifeste est préparée pour un réseau instable,
  mais la validation hors ligne complète n'est pas simulée ;
- la caméra doit être confirmée sur un appareil physique et un navigateur
  disposant de `BarcodeDetector`.
