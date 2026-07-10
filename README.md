# MyPageLinks

A Firefox extension to save and organize your page links.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Firefox](https://www.mozilla.org/firefox/) (for development)

## Setup

```bash
pnpm install
```

## Scripts

| Command            | Description                                      |
|--------------------|--------------------------------------------------|
| `pnpm run build`   | Compile TypeScript and copy assets to `dist/`    |
| `pnpm run dev`     | Build and launch Firefox with the extension      |
| `pnpm run lint`    | Lint the extension with `web-ext lint`           |
| `pnpm run package` | Build and package into a `.zip` in `artifacts/`  |

## Project Structure

```
src/
├── background.ts        # Background script
├── manifest.json        # Extension manifest (Manifest V2)
├── icons/               # Extension icons
│   ├── icon-48.png
│   └── icon-96.png
└── popup/
    ├── popup.html       # Popup UI
    ├── popup.css        # Popup styles
    └── popup.ts         # Popup logic
```

## Development

1. Run `pnpm run dev` to build and open Firefox with the extension loaded.
2. Make changes to files in `src/` — rebuild with `pnpm run build`.
3. Run `pnpm run lint` to check for extension issues.
4. Run `pnpm run package` to create a distributable `.zip`.
