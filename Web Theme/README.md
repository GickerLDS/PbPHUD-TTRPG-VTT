# PBPHUD Fantasy Theme Prototype

This folder contains a static HTML/CSS theme preview for PBPHUD:

- `index.html` previews the splash, login/register, campaign dashboard, forum, and VTT/map surfaces.
- `styles.css` includes both preview-specific styles and override selectors that match the current PBPHUD React app, including dashboard, topbar, workspace, map, forum, and BBCode editor classes.
- `assets/hero-table-map.png` is the generated hero background used by the splash screen.

The visual direction is clean fantasy: forest shell, parchment reading surfaces, brass buttons, ruby unread/status accents, and restrained VTT chrome so the map stays dominant.

Local preview URL used during QA:

```text
http://127.0.0.1:4177/
```

QA checks completed:

- Desktop viewport: hero asset loads, no horizontal overflow, map area remains large.
- Mobile viewport at 390px: dashboard forms stack, VTT collapses to a single column, no horizontal overflow.
