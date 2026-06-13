# Parcel Tracker — Contexte projet

## Stack technique

- **Backend** : Node.js + Express
- **Base de données** : SQLite (`better-sqlite3`)
- **Frontend** : HTML/CSS/JS vanilla
- **Bot** : `node-telegram-bot-api`
- **Scheduler** : `node-cron`
- **HTTP client** : `axios`
- **Hébergement** : Docker + Traefik (réseau externe `frontend`)
- **Repo GitHub** : https://github.com/XPouPouille/Parcel.git (branche `main`)
- **Stack Docker** : nommée `Parcel` (`docker compose -p Parcel`)

---

## Structure des fichiers

```
parcel/
├── Dockerfile
├── docker-compose.yml         ← labels Traefik, réseau frontend, volume parcel_data
├── .env.example
├── package.json
├── src/
│   ├── server.js              ← API Express (toutes les routes)
│   ├── database.js            ← SQLite : tables packages + settings, migrations
│   ├── tracker.js             ← Routeur principal transporteurs
│   ├── telegram.js            ← Bot Telegram + notifications
│   ├── scheduler.js           ← Cron vérification horaire, rechargeable à chaud
│   └── carriers/
│       ├── index.js           ← Auto-détection + routing par slug
│       ├── laposte.js         ← La Poste / Colissimo / Chronopost (LAPOSTE_API_KEY)
│       ├── dhl.js             ← DHL / Deutsche Post (DHL_API_KEY)
│       ├── ups.js             ← UPS OAuth2 (UPS_CLIENT_ID + UPS_CLIENT_SECRET)
│       ├── fedex.js           ← FedEx + TNT OAuth2 (FEDEX_CLIENT_ID + FEDEX_CLIENT_SECRET)
│       ├── usps.js            ← USPS XML API (USPS_USER_ID)
│       ├── postnl.js          ← PostNL (POSTNL_API_KEY)
│       ├── gls.js             ← GLS endpoint public (sans clé)
│       ├── dpd.js             ← DPD endpoint public (sans clé)
│       ├── mondialrelay.js    ← Mondial Relay endpoint interne (code postal requis)
│       └── generic.js         ← Autres : retourne lien suivi officiel
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

---

## Base de données SQLite

### Table `packages`

| Colonne | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-incrémenté |
| `tracking_number` | TEXT UNIQUE | Majuscules |
| `label` | TEXT | Libellé optionnel |
| `postal_code` | TEXT | Requis pour Mondial Relay |
| `carrier` | TEXT | Nom affiché (ex: "Colissimo") |
| `carrier_code` | TEXT | Slug (ex: "colissimo") |
| `status` | TEXT | Voir statuts ci-dessous |
| `status_code` | INTEGER | Code brut transporteur |
| `last_event` | TEXT | Dernier événement en texte |
| `events` | TEXT | JSON `[{date, description, location}]` |
| `last_checked` | DATETIME | Dernière vérification |
| `created_at` | DATETIME | Date d'ajout |
| `completed_at` | DATETIME | Date de livraison |

**Migration automatique** : la colonne `postal_code` est ajoutée via `ALTER TABLE` si absente (installations existantes).

### Table `settings`

| Clé | Valeur par défaut |
|---|---|
| `check_interval_minutes` | `60` (ou valeur de `CHECK_INTERVAL_MINUTES` dans .env) |

---

## Statuts internes

| Slug | Label FR |
|---|---|
| `pending` | En attente |
| `in_transit` | En transit |
| `pickup` | Prêt à retirer |
| `undelivered` | Tentative échouée |
| `delivered` | Livré |
| `alert` | Alerte |
| `not_found` | Introuvable |
| `not_configured` | Non configuré (clé API manquante) |
| `expired` | Expiré |

Les colis `delivered` et `expired` passent dans l'onglet **Terminé**. Le scheduler ne revérifie pas `delivered`, `expired`, `not_found`, `not_configured`.

---

## API REST (`src/server.js`)

| Méthode | Route | Corps / Notes |
|---|---|---|
| `GET` | `/api/packages` | Liste tous les colis, events parsés en JSON |
| `POST` | `/api/packages` | `{ tracking_number, label?, carrier_code?, postal_code? }` — insert pending, fetch async |
| `GET` | `/api/packages/:id` | Détail d'un colis |
| `PATCH` | `/api/packages/:id` | `{ label }` — modifie le libellé |
| `POST` | `/api/packages/:id/refresh` | Force re-check immédiat |
| `POST` | `/api/refresh` | Force re-check de tous les colis (async) |
| `DELETE` | `/api/packages/:id` | Supprime |
| `GET` | `/api/carriers` | Liste transporteurs + `configured: bool` + `needs_key` |
| `GET` | `/api/config` | `{ check_interval_minutes }` |
| `PUT` | `/api/config` | `{ check_interval_minutes }` → sauvegarde DB + recharge cron |
| `GET` | `/api/status` | Statistiques + état Telegram/tracking |

**Validation Mondial Relay** : le serveur retourne `400` si `carrier_code === 'mondialrelay'` et `postal_code` est absent.

---

## Transporteurs (`src/carriers/`)

### Interface commune — chaque module exporte :
```javascript
async function track(trackingNumber, postalCode?) {
  return {
    carrier: 'Nom affiché',
    carrier_code: 'slug',
    status: 'in_transit',     // slug interne
    last_event: 'texte...',
    events: [{ date, description, location }],
    // si non configuré :
    status: 'not_configured',
    error: 'message instructions',
  };
}
```

### Transporteurs implémentés

| Slug | Module | Méthode | Clé .env |
|---|---|---|---|
| `laposte` | laposte.js | API `api.laposte.fr/suivi/v2/idships/` | `LAPOSTE_API_KEY` |
| `colissimo` | laposte.js | idem | `LAPOSTE_API_KEY` |
| `chronopost` | laposte.js | idem | `LAPOSTE_API_KEY` |
| `dhl` | dhl.js | API `api.dhl.com/track/shipments` | `DHL_API_KEY` |
| `deutschepost` | dhl.js | idem | `DHL_API_KEY` |
| `ups` | ups.js | OAuth2 `onlinetools.ups.com` | `UPS_CLIENT_ID` + `UPS_CLIENT_SECRET` |
| `fedex` | fedex.js | OAuth2 `apis.fedex.com` | `FEDEX_CLIENT_ID` + `FEDEX_CLIENT_SECRET` |
| `tnt` | fedex.js | idem | `FEDEX_CLIENT_ID` + `FEDEX_CLIENT_SECRET` |
| `usps` | usps.js | XML `production.shippingapis.com` | `USPS_USER_ID` |
| `postnl` | postnl.js | API `api.postnl.nl/shipment/v2/status/barcode/` | `POSTNL_API_KEY` |
| `gls` | gls.js | Public `gls-group.com/app/service/open/rest/EU/en/rstt001` | Aucune |
| `dpd` | dpd.js | Public `tracking.dpd.fr` + fallback `tracking.dpd.de` | Aucune |
| `mondialrelay` | mondialrelay.js | `mondialrelay.fr/api/package/{n}/tracking` | Aucune *(code postal requis)* |
| Autres | generic.js | Retourne `not_configured` + lien officiel | — |

### Auto-détection (`carriers/index.js` → `detectSlug()`)

Regex sur le format du numéro de suivi :
- `1Z...` → UPS
- `94/93/92...` ou `XX999999999US` → USPS
- `XX999999999FR` → La Poste
- `6C/8L/8M...` → Colissimo
- `JD...` ou 10 chiffres → DHL
- 12/15/20 chiffres → FedEx
- 8 chiffres → Mondial Relay
- 11 chiffres → GLS
- 14 chiffres → DPD
- `XX999999999NL` → PostNL
- `XX999999999GB` → Royal Mail

---

## Scheduler (`src/scheduler.js`)

- Démarre avec `startScheduler(db)` au boot
- Lit l'intervalle depuis la table `settings` (pas le .env)
- **Rechargeable à chaud** via `reloadScheduler()` — appelé par `PUT /api/config` sans redémarrer le container
- Ignore les colis avec status `delivered`, `expired`, `not_found`, `not_configured`
- Passe `carrier_code` et `postal_code` stockés pour éviter la re-détection
- Notifie Telegram si le statut change

---

## Bot Telegram (`src/telegram.js`)

- Activé si `TELEGRAM_BOT_TOKEN` présent dans .env
- Notifie le chat `TELEGRAM_CHAT_ID` à chaque changement de statut
- Notifie aussi à l'ajout d'un nouveau colis

### Commandes bot

| Commande | Action |
|---|---|
| `/start` | Affiche l'ID du chat courant |
| `/colis` | Liste les colis en cours avec statut et dernier événement |
| `/aide` | Aide et ID du chat |

---

## Frontend (`public/`)

### Formulaire d'ajout
- Champ numéro de suivi + libellé optionnel
- Toggle **Détection auto** / **Je connais le transporteur**
- Dropdown transporteurs (23 entrées) — affiche `⚠ (clé API manquante)` si non configuré
- Champ **Code postal destinataire** — apparaît automatiquement si Mondial Relay sélectionné

### Onglets
- **En cours** : statuts autres que `delivered`/`expired`
- **Terminé** : statuts `delivered`/`expired`

### Modal de détail
- Nom, transporteur, badge statut
- Timeline des événements
- Si `not_configured` : note orange avec instructions
- Bouton refresh individuel (rechargement à chaud)
- Bouton supprimer

### Paramètres (bouton ⚙️ header)
- Choix de l'intervalle en **minutes** ou **heures**
- Conversion automatique entre les deux unités
- Aperçu texte : *"Vérification toutes les 2 heures"*
- Sauvegarde via `PUT /api/config` → recharge le cron sans redémarrage

### Thème
- Clair / sombre (CSS variables, toggle dans le header, persisté `localStorage`)

### Auto-refresh
- Recharge la liste toutes les 5 minutes côté navigateur

---

## Variables d'environnement (`.env`)

```env
APP_DOMAIN=parcel.votre-domaine.com       # Domaine Traefik (sans https://)
APP_URL=https://parcel.votre-domaine.com  # URL complète pour les liens Telegram
PORT=3000

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CHECK_INTERVAL_MINUTES=60                  # Valeur initiale (modifiable via UI)

LAPOSTE_API_KEY=
DHL_API_KEY=
UPS_CLIENT_ID=
UPS_CLIENT_SECRET=
FEDEX_CLIENT_ID=
FEDEX_CLIENT_SECRET=
USPS_USER_ID=
POSTNL_API_KEY=
```

---

## Docker

```yaml
# docker-compose.yml résumé
services:
  parcel-tracker:
    build: .
    container_name: parcel-tracker
    restart: unless-stopped
    networks: [frontend]
    volumes: [parcel_data:/app/data]
    env_file: [.env]
    labels:
      # Traefik : router HTTP→HTTPS + TLS Let's Encrypt
      # APP_DOMAIN utilisé dans les labels
```

```bash
sudo docker compose -p Parcel up -d --build   # déployer / mettre à jour
sudo docker compose -p Parcel restart          # redémarrer
sudo docker compose -p Parcel down             # arrêter
sudo docker logs -f parcel-tracker             # logs
sudo docker image prune -f                     # nettoyer images
```

---

## Commandes Git

```bash
sudo git clone https://github.com/XPouPouille/Parcel.git
sudo git pull          # mise à jour
git add ...
git commit -m "..."
git push               # vers origin/main
```
