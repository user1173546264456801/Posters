# Poster Studio

Générateur de texture pour les 3 posters de la map VRChat. Chacun choisit ses visuels, les place, et télécharge un PNG 1024 × 1024 qui suit exactement l'alpha de la map.

Tout se passe dans le navigateur : aucune image n'est envoyée sur un serveur.

## Ce que fait l'export
- PNG RGBA 1024 × 1024, alpha = `Alpha.png` au pixel près
- Peinture murale : luminosité 80 %, saturation −10 % (appliqué uniquement à l'export de cette zone)
- Couleurs conservées sous les zones transparentes (pas de halo noir au filtrage)
- Fichier nommé `posters_<pseudo>.png`

## Déployer sur GitHub Pages
1. Crée un dépôt sur GitHub et pousse le contenu de ce dossier à la racine :
   ```bash
   git init && git add . && git commit -m "Poster Studio"
   git branch -M main
   git remote add origin https://github.com/<toi>/<repo>.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Le site est en ligne après ~1 min sur `https://<toi>.github.io/<repo>/`.

Tester en local : ouvre simplement `index.html` dans le navigateur.

## Ajuster les zones
Tout est en haut de `app.js`, dans `ZONES` :
- `rect` : rectangle de la zone dans la texture
- `world` : proportions réelles en jeu (ratio du cadre d'édition)
- `quad` : coins de la zone dans le screenshot (aperçu en scène)
- `grade` : retouche à l'export

Pour changer l'alpha : remplace `assets/alpha.js` (PNG en niveaux de gris encodé en base64).
