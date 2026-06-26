https://stoxor-web.github.io/travel-planner/

# Travel Planner — Lucas S.

Version **V4.15 — connexion Google ou e-mail + Firebase actif**.

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
git commit -m "V4.13 reparation graphique stable Firebase"
git push origin main
```

Après publication, ouvre le site en navigation privée ou vide le cache du navigateur.

## V4.15 — Connexion au choix

Cette version conserve Firebase actif et ajoute deux modes de connexion :

- connexion avec Google ;
- connexion avec adresse e-mail et mot de passe ;
- création de compte e-mail ;
- réinitialisation du mot de passe ;
- sauvegarde automatique dans Firestore après connexion.

Firebase Authentication doit avoir les fournisseurs **Google** et **Adresse e-mail/Mot de passe** activés.

Le fichier `js/firebase-config.js` est conservé et rempli. Aucun fichier `firebase-config.example` n’est ajouté.

