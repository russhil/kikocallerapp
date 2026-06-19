# Ordertaker Landing Pages

Static HTML/CSS/JS pages powering [ordertaker.kiko.live](https://ordertaker.kiko.live)

## Pages

| URL | File | Description |
|-----|------|-------------|
| [ordertaker.kiko.live/](https://ordertaker.kiko.live/) | `index.html` | Main homepage |
| [ordertaker.kiko.live/english](https://ordertaker.kiko.live/english) | `english.html` | English landing page |
| [ordertaker.kiko.live/hindi](https://ordertaker.kiko.live/hindi) | `hindi.html` | Hindi landing page |
| [ordertaker.kiko.live/selfhelp/](https://ordertaker.kiko.live/selfhelp/) | `selfhelp/index.html` | Self-help guide |
| [ordertaker.kiko.live/deletion](https://ordertaker.kiko.live/deletion) | `deletion.html` | Account deletion page |
| [ordertaker.kiko.live/privacy](https://ordertaker.kiko.live/privacy) | `privacy.html` | Privacy policy |
| [ordertaker.kiko.live/terms](https://ordertaker.kiko.live/terms) | `terms.html` | Terms of service |

## Structure

```
ordertaker-landing/
├── index.html          ← Homepage
├── english.html        ← English landing page
├── hindi.html          ← Hindi landing page
├── selfhelp/
│   └── index.html      ← Self-help page
├── deletion.html       ← Account deletion
├── privacy.html        ← Privacy policy
├── terms.html          ← Terms of service
├── styles.css          ← Shared stylesheet
├── app.js              ← Shared JavaScript
└── images/             ← Image assets
```

## Deployment

Served via Nginx on the `ordertaker.kiko.live` domain.
