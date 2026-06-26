# Travel Planner — Lucas S. Edition

Application web personnelle de planification de voyages, hébergeable sur GitHub Pages, synchronisée avec Google/Firebase.

## Nouveauté V4.7 — Communauté

Cette version ajoute une vraie page **Communauté** :

- page accessible à tous depuis le menu `Communauté` ;
- publication d’un voyage actif dans une galerie publique ;
- rangement par pays / zone ;
- rangement par catégorie : roadtrip, city break, aventure, nature, plage, culture, gastronomie, famille, petit budget, confort ;
- tri par tendance, récents, votes, durée ou budget ;
- système de vote `+ Tendance` / `-` ;
- possibilité de copier un voyage communautaire dans son espace personnel ;
- publication sécurisée : options pour masquer le budget et les notes privées ;
- suppression possible par l’auteur de sa propre publication.

## Fichiers importants

```text
index.html
css/style.css
js/app.js
js/firebase-sync.js
js/storage.js
firestore.rules
```

Le projet conserve le vrai fichier :

```text
js/firebase-config.js
```


## Firestore

Copie le contenu de `firestore.rules` dans :

**Firebase Console → Firestore Database → Rules**

Les règles ajoutent la collection :

```text
communityTrips
```

Elle est lisible publiquement, mais la création, le vote, la modification et la suppression restent encadrés par Firebase Authentication.

## Déploiement GitHub Pages

Remplace tout le contenu de ton dépôt par le contenu du ZIP, puis attends quelques minutes que GitHub Pages publie la nouvelle version. En cas d’ancien rendu, ouvre le site en navigation privée ou vide le cache du navigateur.


## Version Firebase verrouillée

Cette archive est prête à l’emploi avec la configuration Firebase du projet `travel-planner-60337`.

- Le fichier actif est `js/firebase-config.js`.
- Aucun fichier `firebase-config.example` ne doit être ajouté.
- La connexion Google reste disponible en permanence.
- Les voyages sont chargés et sauvegardés dans Firestore après connexion.
- Si une nouvelle version est générée, elle doit conserver ce fichier Firebase actif.

Après mise en ligne, vérifier dans Firebase :

1. Authentication > Google activé.
2. Authorized domains contient `stoxor-web.github.io`.
3. Firestore Rules contient les règles du fichier `firestore.rules`.
