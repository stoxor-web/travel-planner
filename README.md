https://stoxor-web.github.io/travel-planner/

# Travel Planner — Lucas S.

Version **V4.19 — bloc de connexion visuel + Firebase actif**.

Cette version répare la base visuelle et fonctionnelle du site avec un dossier complet cohérent : HTML, CSS, JavaScript, Firebase, communauté, budget, planning, carte, préparation et carnet.

## Important

- Firebase est configuré dans `js/firebase-config.js`.
- Aucun fichier `firebase-config.example` n’est inclus.
- La première ligne du README contient toujours le lien du site.
- Remplace tout le contenu du dépôt GitHub Pages par cette archive complète.
- Copie aussi `firestore.rules` dans Firebase Console → Firestore Database → Rules.

## Publication

```bash
git add .
git commit -m "V4.19 bloc de connexion visuel"
git push origin main
```

Après publication, ouvre le site en navigation privée ou vide le cache du navigateur.

## V4.16 — Connexion au choix

Cette version conserve Firebase actif et ajoute trois modes de connexion :

- connexion avec Google ;
- connexion avec adresse e-mail et mot de passe ;
- création de compte e-mail ;
- réinitialisation du mot de passe ;
- accès invité anonyme via Firebase Authentication ;
- sauvegarde automatique dans Firestore après connexion.

Firebase Authentication doit avoir les fournisseurs **Google** et **Adresse e-mail/Mot de passe** activés.

Le fichier `js/firebase-config.js` est conservé et rempli. Aucun fichier `firebase-config.example` n’est ajouté.



## V4.16 — Connexion anonyme ajoutée

Cette version conserve Firebase actif et ajoute un troisième mode de connexion :

- Google ;
- adresse e-mail / mot de passe ;
- accès invité anonyme via Firebase Authentication.

Le fournisseur **Anonyme** doit être activé dans Firebase Authentication.
Aucun fichier `firebase-config.example` n’est inclus.

## V4.19 — Bloc de connexion

- Remplacement du texte brut “Connexion requise.” par un bloc visuel “Choisis ton mode de connexion”.
- Bouton supérieur plus lisible : “Se connecter / Choisir un accès”.
- Firebase, Google, e-mail et invité anonyme conservés.
- Aucun fichier `firebase-config.example`.

## V4.17 — Correction Communauté

Cette version corrige l’erreur `Communauté : Missing or insufficient permissions` lors de la publication d’un voyage.

À faire obligatoirement après publication des fichiers : copier le contenu de `firestore.rules` dans Firebase Console → Firestore Database → Rules, puis cliquer sur **Publier**.

Les règles sont compatibles avec :

- Google ;
- e-mail / mot de passe ;
- invité anonyme ;
- publication dans `communityTrips` ;
- vote communautaire ;
- retrait par propriétaire ou admin Lucas S.
