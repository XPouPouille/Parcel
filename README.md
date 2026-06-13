# 📦 Parcel Tracker

Application de suivi de colis multi-transporteurs, auto-hébergée, avec notifications Telegram.

**Fonctionnalités :**
- Ajout d'un numéro de suivi → détection automatique du transporteur
- Onglet **En cours** / onglet **Terminé**
- Vérification automatique toutes les heures
- Notifications Telegram à chaque changement de statut
- Intégration Traefik (HTTPS automatique via Let's Encrypt)
- Thème clair / sombre

---

## Prérequis

- Docker + Docker Compose installés
- Traefik déployé avec le réseau externe `traefik_proxy`
- Un nom de domaine pointant vers votre serveur
- Clé API [17track](https://www.17track.net/en/api) (gratuit, 100 suivis/mois)
- Un bot Telegram (créé via [@BotFather](https://t.me/BotFather))

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/XPouPouille/Parcel.git
cd Parcel
```

### 2. Créer et remplir le fichier `.env`

```bash
cp .env.example .env
nano .env
```

Renseigner les variables :

```env
# Domaine Traefik (sans https://)
APP_DOMAIN=parcel.votre-domaine.com

# URL complète (pour les liens dans les notifications Telegram)
APP_URL=https://parcel.votre-domaine.com

PORT=3000

# Clé API 17track — https://www.17track.net/en/api
TRACK17_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Bot Telegram — créé via @BotFather
TELEGRAM_BOT_TOKEN=123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ

# ID du chat Telegram qui reçoit les notifications
# → Démarrer le bot, envoyer /start, l'ID s'affiche
TELEGRAM_CHAT_ID=123456789

# Intervalle de vérification en minutes (défaut: 60)
CHECK_INTERVAL_MINUTES=60
```

#### Obtenir le `TELEGRAM_CHAT_ID`

1. Déployer le stack une première fois
2. Ouvrir Telegram, chercher votre bot et envoyer `/start`
3. Le bot répond avec l'ID de votre chat
4. Renseigner cet ID dans `.env`, puis redémarrer le stack

### 3. Déployer le stack "Parcel"

```bash
docker compose -p Parcel up -d --build
```

L'application est accessible sur `https://parcel.votre-domaine.com`.

---

## Mise à jour

```bash
# Récupérer la dernière version
git pull

# Reconstruire et redémarrer le stack
docker compose -p Parcel up -d --build

# (optionnel) Supprimer les images inutilisées
docker image prune -f
```

---

## Commandes utiles

```bash
# Voir les logs en temps réel
docker logs -f parcel-tracker

# Arrêter le stack
docker compose -p Parcel down

# Arrêter et supprimer les données (⚠ irréversible)
docker compose -p Parcel down -v

# Redémarrer sans rebuild
docker compose -p Parcel restart
```

---

## API REST

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/packages` | Liste tous les colis |
| `POST` | `/api/packages` | Ajouter un colis `{ tracking_number, label? }` |
| `GET` | `/api/packages/:id` | Détail d'un colis |
| `PATCH` | `/api/packages/:id` | Modifier le libellé `{ label }` |
| `POST` | `/api/packages/:id/refresh` | Forcer la mise à jour d'un colis |
| `POST` | `/api/refresh` | Forcer la mise à jour de tous les colis |
| `DELETE` | `/api/packages/:id` | Supprimer un colis |
| `GET` | `/api/status` | Statistiques et état du service |

---

## Commandes Telegram

| Commande | Description |
|---|---|
| `/start` | Affiche l'ID du chat (utile pour configurer `TELEGRAM_CHAT_ID`) |
| `/colis` | Liste les colis en cours avec leur statut |
| `/aide` | Affiche l'aide |

---

## Transporteurs supportés

Via l'API 17track : La Poste, Colissimo, Chronopost, Mondial Relay, DHL, UPS, FedEx, GLS, DPD, TNT, Amazon Logistics et des centaines d'autres transporteurs internationaux.

---

## Structure

```
Parcel/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── src/
│   ├── server.js       ← API Express
│   ├── database.js     ← SQLite
│   ├── tracker.js      ← Intégration 17track
│   ├── telegram.js     ← Bot Telegram
│   └── scheduler.js    ← Vérification horaire
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```
