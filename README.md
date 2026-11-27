```markdown
<div align="center">
  <img src="assets/logo.jpg" alt="Logo" width="200">
  <h1>fruits-legumes</h1>
  <p><i>Découvrez quels fruits et légumes sont de saison et cultivés localement en Belgique, mois par mois.</i></p>
  <p><b>Catégorie:</b> Art / Jeu</p>
  <a href="https://T2Smart-AI.github.io/perchance-fruits-legumes/">Live Demo</a> | <a href="showcase.html">Showcase</a> | <a href="screenshots/">Gallery</a>
</div>

<hr>

## 🇧🇪 Français

### Description
Une application interactive dédiée à la consommation locale en Belgique. Elle propose un calendrier saisonnier, des fiches nutritionnelles détaillées, des conseils de préparation et un jeu de match-3 éducatif pour apprendre à mieux choisir ses produits.

### Fonctionnalités
*   **Exploration :** Calendrier interactif et Almanach des produits.
*   **Localisation :** Section dédiée aux produits cultivés en Belgique.
*   **Éducation :** Fiches détaillées incluant les bienfaits et conseils de préparation.
*   **Ludification :** Jeu "Match des Saisons" (Match-3).
*   **Interface :** Navigation fluide entre l'accueil, l'almanach, le calendrier, le jeu et la vue locale via un overlay de détails.

### Contrôles
*   **Souris/Toucher :** Interaction via les boutons (`En ce moment`, `Almanach`, `Calendrier`, `Le Jeu`, `Local`, `Recommencer`).
*   **Navigation :** Flèches de navigation (`<`, `>`) et retour arrière ($\leftarrow$).
*   **Fermeture :** Bouton $\times$ pour fermer les overlays.

### Installation Rapide
*   **Windows :** Double-cliquez sur `start.cmd`.
*   **macOS/Linux :** Exécutez `sh start.sh`.
*   **Alternative :** Lancez `python3 -m http.server` (un serveur HTTP est requis pour le chargement des modules ES).

### Personnalisation
| Variable | Description | Source |
| :--- | :--- | :--- |
| Produits | Liste des fruits et légumes | `src/data/products.js` |
| Localisation | Données locales Belgique | `src/data/local.js` |
| Nutrition | Valeurs nutritionnelles | `src/data/nutrition.js` |
| Niveaux | Configuration du jeu | `src/levels.js` |
| Visuels | Bannières et avatars | `src/data/banners.js` / `avatars.js` |

### Structure du Projet
*   `src/app.js` : Cœur de l'application.
*   `src/game.js` : Logique du jeu de match-3.
*   `src/data/` : Données et configurations.
*   `src/tools/` : Prompts IA pour la génération d'avatars.

### Stack Technique
*   **Rendu :** Canvas API.
*   **Internationalisation :** i18n.
*   **Moteur :** Physique custom.
*   **Stockage :** kv-plugin (IndexedDB).

### Déploiement
L'application est déployée via **GitHub Pages**.

### Notes de Synchronisation
Consultez `notification.md` pour le suivi bidirectionnel entre Perchance et le repo. **Attention :** Les captures d'écran verrouillées ne doivent pas être régénérées manuellement.

### Licence
MIT

---

## 🇬🇧 English

### Description
An interactive application dedicated to local consumption in Belgium. It features a seasonal calendar, detailed nutritional sheets, preparation tips, and an educational match-3 game to help users choose their produce wisely.

### Features
*   **Exploration:** Interactive calendar and produce Almanac.
*   **Localization:** Dedicated section for Belgian-grown produce.
*   **Education:** Detailed sheets including health benefits and preparation advice.
*   **Gamification:** "Season Match" (Match-3) game.
*   **Interface:** Seamless navigation between home, almanac, calendar, game, and local views via a detailed overlay.

### Controls
*   **Mouse/Touch:** Interaction via buttons (`En ce moment`, `Almanach`, `Calendrier`, `Le Jeu`, `Local`, `Recommencer`).
*   **Navigation:** Navigation arrows (`<`, `>`) and back button ($\leftarrow$).
*   **Closing:** $\times$
