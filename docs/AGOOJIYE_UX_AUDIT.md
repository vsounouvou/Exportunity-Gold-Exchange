# Audit UX AGOOJIYE

Date de revue : 26 juillet 2026

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
| Caméra noire affichée avant son activation | Écran inquiétant et gaspillage d'espace sur tablette | Vidéo masquée avant usage, démarrage/arrêt explicites et saisie manuelle conservée |
| Manifeste sans recherche | Contrôle lent lors d'un embarquement chargé | Recherche par passager, réservation ou billet |
| Colonnes et statuts administratifs en anglais | Charge cognitive et manque de finition | Libellés et valeurs métier en français |
| E-mails et statuts interprétés comme des dates | Données illisibles dans l'administration mobilité | Liste fermée de champs réellement datés |
| Deux administrations sans passerelle | L'administrateur ne sait pas où gérer l'équipe ou l'exploitation | Liens réciproques entre administration équipe et mobilité |
| Invitation réduite à un formulaire de mot de passe | Accueil froid et absence de repères | Présentation de l'accompagnement AGOOJIYE et rappel de la validation humaine |

## Matrice de validation

| Persona | Parcours vérifié ou couvert | État |
| --- | --- | --- |
| Voyageur mobile | Recherche, voyage, siège, passager, paiement, billet, récupération | Audit production effectué ; nouveau test local à relancer |
| Client commercial | Réserver un bus, démonstration, commande, liste prioritaire | Audit et corrections effectués ; test visuel à relancer |
| Nouveau membre | Invitation, identité AGOOJIYE, autorité humaine | Scénario Playwright ajouté |
| Collaborateur | Priorités, assistant personnel, restrictions CRM/mobilité | Scénario Playwright ajouté |
| Responsable | Contexte départemental, équipe, CRM et mobilité autorisés | Scénario Playwright ajouté |
| Contrôleur | Validation, doublon, recherche manifeste, caméra | Scénario Playwright ajouté |
| Administrateur mobilité | Données lisibles, recherche, export, changement de statut confirmé | Scénario Playwright ajouté |
| Super-administrateur | Pilotage, assistant unique, synthèse et gouvernance | Scénario Playwright ajouté |

## Critères de réussite visuelle

- aucune action importante masquée sur 390 x 844 ;
- aucun débordement horizontal incohérent ;
- aucun nom d'assistant concurrent visible ;
- aucun statut métier brut en anglais dans les vues principales ;
- retour visible pour tout chargement, erreur ou enregistrement ;
- passage clair entre site public, contrôle, administration mobilité et équipe ;
- toutes les actions sensibles présentées comme soumises à validation humaine.

## Vérifications techniques

Déjà obtenues avant les derniers raffinements :

- compilation TypeScript réussie ;
- 29 tests unitaires ciblés réussis ;
- build de production et contrôle qualité marketing réussis ;
- compilation des scénarios Playwright multi-rôles réussie.

À relancer après les derniers raffinements :

- contrôle TypeScript complet ;
- tests unitaires ciblés ;
- build de production ;
- scénarios Playwright avec captures mobile, tablette et desktop ;
- vérification physique de la caméra sur téléphone ;
- test réel des rôles protégés avec MFA, sans contourner l'authentification ;
- contrôle après déploiement sur `https://agoojiye.com`.

## Risques restant explicitement assumés

- le paiement reste un fournisseur de démonstration tant qu'un prestataire réel
  et ses webhooks ne sont pas configurés ;
- le modèle 3D procédural reste un visuel de remplacement, pas un modèle
  d'ingénierie homologué ;
- la consultation limitée du manifeste est préparée pour un réseau instable,
  mais la validation hors ligne complète n'est pas simulée ;
- la caméra doit être confirmée sur un appareil physique et un navigateur
  disposant de `BarcodeDetector`.
