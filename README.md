# 🌐 OmniDownloader - Téléchargeur Vidéo Universel

OmniDownloader est une application web moderne, réactive et élégante permettant de télécharger des vidéos et des pistes audio à partir de nombreuses plateformes (YouTube, Instagram, TikTok, LinkedIn, Twitter/X, Facebook, etc.). 

L'application est conçue pour être déployée **100% gratuitement** sur des plateformes cloud prenant en charge Docker (comme Hugging Face Spaces, Render ou Koyeb).

---

## ✨ Fonctionnalités Clés

1. **Multi-Plateformes** : Téléchargement depuis YouTube, Instagram, TikTok, LinkedIn, Twitter/X, Facebook, et +1000 autres sites grâce à `yt-dlp`.
2. **Détection Dynamique de Plateforme** : L'interface détecte automatiquement la plateforme à la saisie du lien et adapte son style visuel (lueur lumineuse de la couleur de la marque, badge, etc.).
3. **Options Avancées** :
   - Sélection de la qualité vidéo (4K, 1080p, 720p, etc.).
   - Extraction de la piste audio au format MP3 haute qualité.
   - Conversion forcée de format (MP4, MKV, WebM).
   - Gestion des playlists (sélectionner/désélectionner les vidéos à inclure).
4. **Mises à jour des extracteurs en 1 clic** : Bouton d'administration dans le footer permettant de mettre à jour la bibliothèque `yt-dlp` en arrière-plan sans reconstruire ou redémarrer le conteneur.
5. **Nettoyage automatique de l'espace disque** : Un processus en arrière-plan nettoie les fichiers téléchargés et expirés toutes les 30 minutes.
6. **Progressive Web App (PWA)** : Installable sur mobile et ordinateur pour un accès instantané comme une application native.

---

## 🛠️ Stack Technique

- **Backend** : FastAPI (Python 3.10+) pour des performances optimales et le streaming d'événements en temps réel (SSE).
- **Moteur d'extraction** : `yt-dlp` + `ffmpeg` (pour fusionner les flux vidéo et audio HD).
- **Frontend** : HTML5 sémantique, Vanilla CSS (Design Glassmorphism premium, animations, palette de couleurs moderne sombre) et Javascript (SSE, PWA).
- **Conteneurisation** : Dockerfile préconfiguré pour la conformité de sécurité (uid 1000, port 7860) requise par Hugging Face.

---

## 🚀 Lancement Local

### Prérequis
- Python 3.10 ou supérieur.
- `ffmpeg` installé sur votre système (requis pour la fusion vidéo/audio HD de yt-dlp).

### Étapes
1. Ouvrez un terminal dans le dossier du projet :
   ```bash
   cd /home/almuxtaar/.gemini/antigravity/scratch/universal-downloader
   ```
2. Créez un environnement virtuel et activez-le :
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Installez les dépendances :
   ```bash
   pip install -r requirements.txt
   ```
4. Lancez le serveur de développement :
   ```bash
   python3 main.py
   ```
5. Accédez à l'application dans votre navigateur à l'adresse : [http://localhost:7860](http://localhost:7860)

---

## ☁️ Déploiement Gratuit : Guide Étape par Étape

Pour faire fonctionner `yt-dlp` et `ffmpeg` de manière stable et gratuite, les hébergeurs traditionnels comme Vercel ou Netlify (Serverless) ne conviennent pas (limitation de taille et de temps d'exécution). Les solutions suivantes sont optimales et entièrement gratuites.

### Option A : Hugging Face Spaces (Recommandé - 100% Gratuit à vie)
Hugging Face fournit des conteneurs CPU gratuits et permanents. C'est l'option la plus stable car le service ne s'éteint pas de manière agressive.

1. Créez un compte gratuit sur [Hugging Face](https://huggingface.co/).
2. Cliquez sur **Spaces** dans le menu, puis sur **Create new Space**.
3. Configurez le Space :
   - **Space Name** : `omnidownloader` (ou le nom de votre choix).
   - **License** : `mit`.
   - **SDK** : Sélectionnez **Docker**.
   - **Docker template** : Choisissez **Blank** (Vide).
   - **Space Hardware** : Choisissez le CPU de base gratuit (2 vCPU, 16 Go RAM).
   - **Visibility** : **Public** ou **Private**.
4. Cliquez sur **Create Space**.
5. Hugging Face va vous donner une URL de dépôt Git. Vous pouvez y cloner le projet, ajouter le code et le push, ou **importer les fichiers directement via l'interface web de Hugging Face** :
   - Allez dans l'onglet **Files and versions** de votre Space.
   - Cliquez sur **Add file** -> **Upload files**.
   - Glissez-déposez le dossier du projet (comprenant `main.py`, `requirements.txt`, `Dockerfile` et le dossier `static`).
   - Validez le commit.
6. L'application va se construire automatiquement (Docker va installer `ffmpeg` et démarrer FastAPI sur le port 7860). En 2 minutes, votre application est en ligne et accessible gratuitement à l'adresse fournie par Hugging Face !

---

### Option B : Koyeb (Gratuit - Déploiement via GitHub)
Koyeb offre un plan gratuit très performant avec support Docker natif.

1. Créez un compte sur [Koyeb](https://www.koyeb.com/).
2. Créez un nouveau dépôt sur GitHub contenant les fichiers du projet.
3. Sur Koyeb, cliquez sur **Create Service**.
4. Sélectionnez **GitHub** comme source, et choisissez votre dépôt.
5. Dans la configuration du service :
   - Koyeb détectera automatiquement le `Dockerfile` et configurera le port d'écoute.
   - Assurez-vous que le port est bien réglé sur `7860` (ou ajoutez une variable d'environnement `PORT=8000`).
6. Validez. L'application est déployée et Koyeb fournit un nom de domaine HTTPS gratuit.

---

### Option C : Render.com (Gratuit - Redémarrage après inactivité)
Render permet d'héberger des Web Services basés sur Docker gratuitement.

1. Créez un compte sur [Render](https://render.com/).
2. Poussez votre code sur un dépôt GitHub.
3. Sur Render, cliquez sur **New +** -> **Web Service**.
4. Connectez votre dépôt GitHub.
5. Configurez le service :
   - **Runtime** : Sélectionnez **Docker**.
   - **Instance Type** : Choisissez **Free**.
6. Cliquez sur **Create Web Service**. L'application sera disponible gratuitement. *Note : Sur le plan gratuit de Render, le conteneur s'endort après 15 minutes d'inactivité et prend environ 50 secondes à se réveiller.*
