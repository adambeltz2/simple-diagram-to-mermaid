# Diagram → Mermaid

**Live app: https://adambeltz2.github.io/simple-diagram-to-mermaid/**

A drag-and-drop canvas (think draw.io) that is a **two-way editor for Mermaid flowcharts**.
Draw visually and get Mermaid code, or paste/edit Mermaid and see it on the canvas.

## Features
## Workspaces
One app, separate workspaces for separate jobs (switch at the top; each has its own address and saved state):

- **Diagrams** (`#/diagrams`): flowcharts, state diagrams and ER diagrams on a drag-and-drop canvas (below).
- **Gantt** (`#/gantt`): project plans. A visual editor and the Mermaid/Markdown text stay in sync, and the chart rerenders as you type, so small changes don't need a push and pull.
  - **Edit / View**: *View* shows just the rendered chart for readers; *Edit* adds the editor.
  - **Visual editing**: drag a bar to move it, drag its right edge to resize, drag the dot at a bar's end onto another bar to make that one start after it. Tasks that follow a moved task move with it; dragging a follower detaches it (with an Undo). Add tasks, milestones and sections, set status (done / active / critical / milestone), and edit names, IDs, dates and lengths in the inspector.
  - **Text editing**: the Mermaid source is editable at any time. Config lines, comments, `click` lines, frontmatter and anything unparseable are kept and written back.
  - **Saving and sharing**: autosaves in your browser. **Share link** puts the whole plan in the URL (nothing is stored on a server); whoever opens it sees the chart in View mode, and their edits stay in their own browser. **Download .mmd / .md / SVG**, or **Open .md / .mmd**: when you open a Markdown file, the surrounding text is kept and written back around the chart on *Download .md*.
  - **Limits**: the visual editor needs `dateFormat YYYY-MM-DD` (other formats open as text only); bars show calendar days, so `excludes weekends` is applied by the preview but not by the bars; tasks and sections can't be reordered by dragging yet.
- **Timeline** is next.

## Diagrams features
- **Three diagram types**: flowcharts, **state diagrams** and **ER diagrams** (`erDiagram`)
- **ER diagrams**: entity tables with editable attributes (type, name, `PK`/`FK`/`UK`, comment), aliases, hyphenated and quoted names, and relationships with crow's-foot cardinality (one / zero-or-one / zero-or-more / one-or-more on each end) and identifying (solid) or non-identifying (dotted) lines. Paste any `erDiagram` and it opens as an ER diagram. Attribute lines the canvas can't parse are kept as text
- **State diagrams** (`stateDiagram-v2`), switched from the toolbar. State diagrams support states, start/end markers (per composite scope), choice and fork/join nodes, composite states (nested, with their own direction), and `classDef`/`class`. Paste any `stateDiagram-v2` text and it opens as a state diagram. Converting between types maps node kinds sensibly (and drops styling the other type can't express)
- Edges can start or end on a whole subgraph / composite state
- Palette of 14 shapes (rectangle, rounded, stadium, decision, circle, database, hexagon, subroutine, parallelogram ×2, trapezoid ×2, flag, double circle) — drag or click to add. The newer `A@{ shape: cyl, label: "…" }` syntax is imported for the shapes above; other `@{ }` shapes (document, icons, …) are kept as-is
- Connect nodes by dragging from a node's edge dot; edge styles: `-->`, `---`, `-.->`, `==>`, with labels; double-click a line to add or edit its label
- **Subgraphs**: a *Group* box on the canvas = Mermaid `subgraph … end` (nesting supported). Drop nodes in, select nodes and click *Group selection*, or *Ungroup* to keep the nodes
- **Colors and styles**: fill / border / text color pickers for nodes and subgraphs, line style and color for edges; imports and re-exports `style`, `classDef`, `class`, `:::class` and `linkStyle`
- **Arrowheads**: `-->`, `---`, `--o`, `--x`, `<-->`, `o--o`, `x--x` in solid, dotted and thick
- **Nothing is silently dropped**: YAML frontmatter, `%%{init}%%` directives, `click`, `accTitle` and any line the canvas can't show are kept verbatim and written back on export (you get a warning listing them)
- Direction toggle (TD / LR / BT / RL) and one-click auto layout
- Live Mermaid code + live rendered preview
- **Import**: edit the code box and click *Apply to canvas*, or import a `.mmd` / `.md` (```mermaid block) file
- **Export**: `.mmd`, SVG, copy to clipboard; *Save project* / *Open project* keeps canvas positions (`.json`)
- Dark / light mode toggle (follows your system by default, remembers your choice)
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z)
- Autosaves to localStorage

## How it works
The source of truth is a graph model (`src/mermaid/types.ts`). The canvas edits it,
`serialize.ts` turns it into Mermaid, and `parse.ts` turns Mermaid back into it.
Node positions are a canvas convenience only — Mermaid lays out its own diagrams.

## Not supported yet
`@{ shape: ... }` shapes beyond the 14 above (kept as text), edge ids. State diagrams: notes (kept as text), concurrent regions (`--`, dropped with a warning), `<<join>>` exports as `<<fork>>`, per-node colors. ER diagrams: the relationship word form (`one or more to zero or more`) is kept as text; per-node colors aren't available. Other diagram types (sequence, class, …) aren't supported yet.
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
