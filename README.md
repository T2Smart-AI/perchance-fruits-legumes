```markdown
<p align="center">
  <img src="assets/logo.jpg" width="128" alt="logo">
  <h1 align="center">fruits-legumes</h1>
  <p align="center"><i>Découvrez quels fruits et légumes sont de saison et cultivés localement en Belgique, mois par mois.</i></p>
  <p align="center"><b>Art / Engine</b></p>
  <p align="center">
    <a href="https://T2Smart-AI.github.io/perchance-fruits-legumes/">Live Demo</a> | 
    <a href="showcase.html">Showcase</a> | 
    <a href="screenshots/">Gallery</a>
  </p>
</p>

---

## 🇫🇷 Français

### Description
Application interactive dédiée à la saisonnalité des fruits et légumes en Belgique. Elle propose un calendrier détaillé, des fiches nutritionnelles, des conseils de préparation et un jeu de match-3 éducatif.

### Fonctionnalités
- **Navigation & Contenu** :
  - `Fruits & Légumes de Saison` (Accueil)
  - `L'Almanach` : Fiches détaillées et bienfaits.
  - `Le Calendrier` : Vue mensuelle interactive.
  - `Manger Local` : Guide des produits locaux.
  - `Match des Saisons` : Jeu de match-3 intégré.
- **Interface** : Overlay de détails, gestion i18n, rendu via Canvas.
- **Système** : Stockage via kv-plugin (IndexedDB).

### Contrôles
- **Souris/Toucher** : Interaction via les boutons (`En ce moment`, `Almanach`, `Calendrier`, `Le Jeu`, `Local`, `←`, `→`, `↻`, `✕`).
- **Clavier** : Non spécifié.

### Installation rapide
- **Windows** : Double-cliquez sur `start.cmd`.
- **macOS/Linux** : Exécutez `sh start.sh`.
- **Autre** : `python3 -m http.server` (un serveur HTTP est requis pour les modules ES).

### Personnalisation
| Variable | Rôle | Source |
| :--- | :--- | :--- |
| `products` | Liste des produits | `src/data/products.js` |
| `nutrition` | Valeurs nutritionnelles | `src/data/nutrition.js` |
| `avatars` | Prompts IA & Images | `src/data/avatars.js` |
| `levels` | Configuration du jeu | `src/levels.js` |

### Structure du Projet
- `src/app.js` : Cœur de l'application.
- `src/game.js` : Logique du jeu de match-3.
- `src/data/` : Fichiers de données (locaux, nutrition, bannières).
- `src/tools/` : Prompts pour la génération d'avatars IA.

### Stack Technique
- **Core** : JavaScript (ES Modules), Canvas API.
- **Plugins** : `ai-text-plugin`, `text-to-image-plugin`, `kv-plugin`, `upload-plugin`.
- **Stockage** : IndexedDB.

### Déploiement
L'application est hébergée via **GitHub Pages**.

### Notes de Synchronisation
Consultez `notification.md` pour le suivi bidirectionnel entre Perchance et le dépôt. **Attention** : Les captures d'écran verrouillées ne doivent pas être régénérées manuellement.

### Licence
MIT

---

## 🇺🇸 English

### Description
An interactive application dedicated to the seasonality of fruits and vegetables in Belgium, featuring a detailed calendar, nutritional sheets, preparation tips, and an educational match-3 game.

### Features
- **Navigation & Content**:
  - `Fruits & Légumes de Saison` (Home)
  - `L'Almanach` (Almanac): Detailed sheets and health benefits.
  - `Le Calendrier` (Calendar): Interactive monthly view.
  - `Manger Local` (Eat Local): Guide to locally grown produce.
  - `Match des Saisons` (Season Match): Integrated match-3 game.
- **Interface**: Detail overlays, i18n support, Canvas-based rendering.
- **System**: Persistent storage via kv-plugin (IndexedDB).

### Controls
- **Mouse/Touch** : Interaction via buttons (`En ce moment`, `Almanach`, `Calendrier`, `Le Jeu`, `Local`, `←`, `→
