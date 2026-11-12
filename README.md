# Diagram → Mermaid

**Live app: https://adambeltz2.github.io/simple-diagram-to-mermaid/**

A drag-and-drop canvas (think draw.io) that is a **two-way editor for Mermaid flowcharts**.
Draw visually and get Mermaid code, or paste/edit Mermaid and see it on the canvas.

## Features
- Palette of 7 shapes (rectangle, rounded, stadium, decision, circle, database, hexagon) — drag or click to add
- Connect nodes by dragging from a node's edge dot; edge styles: `-->`, `---`, `-.->`, `==>`, with labels
- Direction toggle (TD / LR / BT / RL) and one-click auto layout
- Live Mermaid code + live rendered preview
- **Import**: edit the code box and click *Apply to canvas*, or import a `.mmd` / `.md` (```mermaid block) file
- **Export**: `.mmd`, SVG, copy to clipboard; *Save project* / *Open project* keeps canvas positions (`.json`)
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z)
- Autosaves to localStorage

## How it works
The source of truth is a graph model (`src/mermaid/types.ts`). The canvas edits it,
`serialize.ts` turns it into Mermaid, and `parse.ts` turns Mermaid back into it.
Node positions are a canvas convenience only — Mermaid lays out its own diagrams.

## Not supported yet
Subgraphs (flattened on import), `classDef`/`style`, other diagram types.
Unsupported lines are reported as warnings on import.

## Develop
```
npm install
npm run dev      # local dev server
npm test         # converter unit tests
npm run build
```

## Deploy (GitHub Pages)
Pushing to `main` runs `.github/workflows/deploy.yml`. One-time setup:
**Repo → Settings → Pages → Source: GitHub Actions**.

## Versioning
The version shown in the app footer comes from `version` in `package.json`. Bump it with each release.
