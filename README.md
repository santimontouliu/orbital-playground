# Orbital — GitHub Pages edition

A static orbital mechanics simulator with a midnight blue, electric cyan, coral, and cool white palette. Includes circular, elliptical, parabolic, and hyperbolic presets and equations.

## Upload to GitHub Pages

1. Unzip the download on your computer.
2. Create a GitHub repository, or open the repository you want to use.
3. Upload the extracted files into the repository root. `index.html`, `style.css`, and `app.js` must sit alongside each other. Upload the files themselves, not the ZIP or a containing folder. Include `.nojekyll` if your file picker shows hidden files; this plain HTML site also works without it.
4. Commit the uploaded files to `main`.
5. Open Settings → Pages. Under Build and deployment, choose Deploy from a branch, then select `main` and `/(root)`, and save.
6. Wait for GitHub's deployment to complete. The Pages settings show your site URL, usually https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/.

Official setup instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Files

- index.html — page content and equations
- style.css — responsive layout and new palette
- app.js — simulation, drawing, presets, and controls (physics included)
- .nojekyll — tells GitHub Pages to serve the static files directly

No build, packages, API keys, backend, or Sites account is required. Relative asset links work at a GitHub project subpath or custom domain. Google Fonts is optional: system fonts take over when unavailable. You can also open index.html locally to try the simulator.

## Color palette

- Midnight canvas: #091329
- Electric cyan orbit and velocity: #51DDF6
- Coral gravity vector and highlights: #FF897A
- Cobalt controls: #245EE8
- Cool white page: #F3F6FF

## Physics model

Newtonian inverse-square gravity; fixed planet with Earth radius, adjustable mass; negligible satellite mass; no atmosphere. Classification uses conserved launch conditions. Exact circular and escape-speed presets retain full precision. Mathematical conics can intersect the planet; flights stop at impact. Equations and coordinate conventions are explained in the page.

This export includes the updated palette. It is independent of the previously hosted Sites version.
