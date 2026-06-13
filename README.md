# 📦 Parcel Tracker

Application de suivi de colis multi-transporteurs, auto-hébergée, avec notifications Telegram.

**Fonctionnalités :**
- Ajout d'un numéro de suivi → détection automatique du transporteur
- Sélection manuelle du transporteur dans une liste
- Code postal obligatoire pour Mondial Relay
- Onglet **En cours** / onglet **Terminé**
- Vérification automatique configurable (par défaut toutes les heures)
- Notifications Telegram à chaque changement de statut
- Intégration Traefik (HTTPS automatique via Let's Encrypt)
- Thème clair / sombre

---

## Prérequis

- Docker + Docker Compose installés
- Traefik déployé avec le réseau externe `frontend`
- Un nom de domaine pointant vers votre serveur
- Un bot Telegram créé via [@BotFather](https://t.me/BotFather)

---

## Transporteurs supportés

| Transporteur | Intégration | Clé requise |
|---|---|---|
| La Poste / Colissimo / Chronopost | API officielle | `LAPOSTE_API_KEY` — gratuit sur [developer.laposte.fr](https://developer.laposte.fr) |
| DHL + Deutsche Post | API officielle | `DHL_API_KEY` — gratuit sur [developer.dhl.com](https://developer.dhl.com) |
| UPS | API OAuth2 | `UPS_CLIENT_ID` + `UPS_CLIENT_SECRET` — gratuit sur [developer.ups.com](https://developer.ups.com) |
| FedEx + TNT | API OAuth2 | `FEDEX_CLIENT_ID` + `FEDEX_CLIENT_SECRET` — gratuit sur [developer.fedex.com](https://developer.fedex.com) |
| USPS | API Web Tools | `USPS_USER_ID` — gratuit sur [registration.shippingapis.com](https://registration.shippingapis.com) |
| PostNL | API officielle | `POSTNL_API_KEY` — gratuit sur [developer.postnl.nl](https://developer.postnl.nl) |
| GLS | Endpoint public | Aucune clé |
| DPD | Endpoint public | Aucune clé |
| Mondial Relay | Endpoint interne | Aucune clé *(code postal destinataire requis)* |
| Colis Privé, Royal Mail, Hermes… | Lien vers site officiel | — |

---

## Installation

### 1. Cloner le dépôt

```bash
sudo git clone https://github.com/XPouPouille/Parcel.git
cd Parcel
```

### 2. Créer et remplir le fichier `.env`

```bash
sudo cp .env.example .env
sudo nano .env
```

Variables à renseigner :

```env
# Domaine Traefik (sans https://)
APP_DOMAIN=parcel.votre-domaine.com

# URL complète (pour les liens dans les notifications Telegram)
APP_URL=https://parcel.votre-domaine.com

PORT=3000

# ── Telegram ──────────────────────────────────────────
TELEGRAM_BOT_TOKEN=123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ
TELEGRAM_CHAT_ID=123456789

# ── APIs transporteurs (laisser vide = désactivé) ─────
LAPOSTE_API_KEY=
DHL_API_KEY=
UPS_CLIENT_ID=
UPS_CLIENT_SECRET=
FEDEX_CLIENT_ID=
FEDEX_CLIENT_SECRET=
USPS_USER_ID=
POSTNL_API_KEY=
```

#### Obtenir le `TELEGRAM_CHAT_ID`

1. Déployer le stack une première fois
2. Ouvrir Telegram, chercher votre bot et envoyer `/start`
3. Le bot répond avec l'ID de votre chat
4. Renseigner cet ID dans `.env`, puis redémarrer :
   ```bash
   sudo docker compose -p Parcel restart
   ```

### 3. Déployer le stack "Parcel"

```bash
sudo docker compose -p Parcel up -d --build
```

L'application est accessible sur `https://parcel.votre-domaine.com`.

---

## Mise à jour

```bash
# Récupérer la dernière version
sudo git pull

# Reconstruire et redémarrer le stack
sudo docker compose -p Parcel up -d --build

# (optionnel) Supprimer les images inutilisées
sudo docker image prune -f
```

---

## Commandes utiles

```bash
# Voir les logs en temps réel
sudo docker logs -f parcel-tracker

# Arrêter le stack
sudo docker compose -p Parcel down

# Arrêter et supprimer les données (⚠ irréversible)
sudo docker compose -p Parcel down -v

# Redémarrer sans rebuild
sudo docker compose -p Parcel restart

# Vérifier l'état du container
sudo docker ps | grep parcel
```

---

## API REST

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/packages` | Liste tous les colis |
| `POST` | `/api/packages` | Ajouter un colis `{ tracking_number, label?, carrier_code?, postal_code? }` |
| `GET` | `/api/packages/:id` | Détail d'un colis |
| `PATCH` | `/api/packages/:id` | Modifier le libellé `{ label }` |
| `POST` | `/api/packages/:id/refresh` | Forcer la mise à jour d'un colis |
| `POST` | `/api/refresh` | Forcer la mise à jour de tous les colis |
| `DELETE` | `/api/packages/:id` | Supprimer un colis |
| `GET` | `/api/carriers` | Liste des transporteurs et état de configuration |
| `GET` | `/api/config` | Configuration actuelle (intervalle de vérification) |
| `PUT` | `/api/config` | Modifier la configuration `{ check_interval_minutes }` |
| `GET` | `/api/status` | Statistiques et état du service |

---

## Commandes Telegram

| Commande | Description |
|---|---|
| `/start` | Affiche l'ID du chat (pour configurer `TELEGRAM_CHAT_ID`) |
| `/colis` | Liste les colis en cours avec leur statut |
| `/aide` | Affiche l'aide |

---

## Structure

```
Parcel/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── src/
│   ├── server.js          ← API Express
│   ├── database.js        ← SQLite
│   ├── tracker.js         ← Routeur transporteurs
│   ├── telegram.js        ← Bot Telegram
│   ├── scheduler.js       ← Vérification automatique
│   └── carriers/
│       ├── index.js       ← Détection auto + routing
│       ├── laposte.js     ← La Poste / Colissimo / Chronopost
│       ├── dhl.js         ← DHL / Deutsche Post
│       ├── ups.js         ← UPS
│       ├── fedex.js       ← FedEx / TNT
│       ├── usps.js        ← USPS
│       ├── postnl.js      ← PostNL
│       ├── gls.js         ← GLS (sans clé)
│       ├── dpd.js         ← DPD (sans clé)
│       ├── mondialrelay.js← Mondial Relay (code postal requis)
│       └── generic.js     ← Autres (lien officiel)
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```
