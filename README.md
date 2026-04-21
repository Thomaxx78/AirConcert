# AirConcert

> Jouez ensemble. Sans instruments.

AirConcert est une application web multijoueur où plusieurs joueurs forment un groupe virtuel et jouent ensemble en bougeant devant leur caméra. Pas besoin d'instrument : votre corps est l'instrument.

---

## Concept

Chaque joueur choisit un rôle dans le groupe (guitare, basse, batterie, piano, voix…) selon le morceau sélectionné. Pendant le concert, la caméra détecte vos mouvements en temps réel : plus vous bougez, plus votre instrument joue fort. Tous les joueurs sont synchronisés à la milliseconde près pour démarrer ensemble.

---

## Fonctionnalités

- **Sessions multijoueur** — créez ou rejoignez une session via un code à 4 caractères
- **Sélection de morceau** — 5 morceaux disponibles (Rock, Jazz, Pop, Electro, Techno), chacun avec ses propres instruments
- **Détection de mouvement** — la webcam analyse le flux vidéo image par image ; le ratio de pixels modifiés pilote le volume de l'instrument
- **Synthèse audio procédurale** — chaque instrument est généré en temps réel via la Web Audio API (oscillateurs, filtres, enveloppes), aucun fichier audio externe
- **Démarrage synchronisé** — le serveur envoie un timestamp absolu (`startAt`), tous les clients démarrent au même instant
- **Commande vocale** — dans le lobby, un bouton micro permet de choisir le morceau ou son instrument à la voix
- **Transfert d'hôte** — si l'hôte quitte, le rôle est automatiquement transmis au joueur suivant

---

## Interactions

### Écran d'accueil
- **Créer une session** : entrez votre prénom, un code de session est généré automatiquement
- **Rejoindre** : entrez le code partagé par l'hôte et votre prénom

### Lobby
- L'hôte choisit le morceau parmi les 5 disponibles (ou via le bouton micro 🎤)
- Chaque joueur choisit son instrument parmi les stems du morceau (ou via la voix)
- L'hôte lance le concert une fois tous les joueurs prêts

### Concert
- La caméra s'active et détecte vos mouvements
- Votre instrument joue en fonction de l'intensité de vos mouvements (barre de motion visible à l'écran)
- Vous entendez les instruments des autres joueurs, dont le volume est relayé en temps réel par le serveur
- Un timer et une barre de progression affichent l'avancement du morceau

---

## Stack technique

- **Backend** : Node.js + WebSocket (`ws`) — serveur HTTP léger qui sert le frontend et gère les sessions en mémoire
- **Frontend** : HTML/CSS/JS vanilla dans un seul fichier — Web Audio API, MediaDevices (webcam), Web Speech API
- **Pas de build** — l'app tourne directement avec `node server.js`

---

## Lancer le projet

```bash
npm install
npm start
# → http://localhost:3000
```

---

## Équipe

- **Thomas DORET-GAISSET**
- **Thomas FILHOL**
- **Quentin PACHEU**
