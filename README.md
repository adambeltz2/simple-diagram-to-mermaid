# Diagram → Mermaid

**Live app: https://adambeltz2.github.io/simple-diagram-to-mermaid/**

A basic tool to **visually edit Mermaid** and move it in and out of other applications:
paste or open Mermaid (or Markdown containing it), change it visually, and export it again.

## Documents: nothing is ever replaced
Each tab keeps a list of documents (the **Document** picker, top left). Anything you bring in or convert becomes a **new** document next to the others, so there is nothing to confirm and nothing to lose:
- **Import ▾** (*Paste text…* or *Open file…*, `.mmd` / `.md`) opens as a new document. A Markdown file's other text stays with that document.
- **Changing a drawn diagram's type** makes a converted copy and leaves the original. (An empty one just changes type.)
- **New ▾** starts a blank flowchart, state diagram, ER diagram or plan, or a copy of the sample.
- **Manage ▾**: rename, duplicate, delete. Deleting can be undone.
- *Open project* (`.json`) also opens as a new document.
- Undo / redo belong to the document you're in. Everything autosaves quietly in the browser.

## Import and export (same in every tab)
- **Import ▾**: *Paste text…* (plain Mermaid, or Markdown with a `mermaid` block) or *Open file…*. Import works from any tab: a flowchart, state, ER or Gantt chart opens in its visual tab, and every other chart type opens in the **Text** tab, each as a new document there. The tab you were in is left alone. A file or paste meant for the other tab says so and points you there.
- **Export ▾**: *Copy code*, *Download .mmd*, *Download .md* (your chart back in its Markdown block, with the rest of that file around it), *Download SVG* (plain SVG text, which opens in more apps), *Download PNG* (2× size), and **Appearance…**: choose a Light or Dark image regardless of the screen (or match it), a solid or transparent PNG background, and a Mermaid **chart theme** (default, neutral, forest, dark, base) that is saved in the chart's own frontmatter, so apps that read it, such as GitHub, show the same theme.
- **Nothing is silently dropped**: anything the visual editor can't show (frontmatter, `%%{init}%%`, `click`, notes, unknown lines) is kept and written back on export, with a warning listing it.

## Tabs
- **Diagrams**: flowcharts, state diagrams and ER diagrams on a drag-and-drop canvas (below).
- **Text**: any other Mermaid chart (sequence, class, pie, mind map, git graph, and so on) as editable text with a live preview, so every chart can still come in and go out even without a visual editor. If a chart you type here has a visual editor, an **Open in the visual editor** button hands it over.
- **Gantt**: project plans with a visual editor: drag a bar to move it, drag its right edge to resize, drag the dot at a bar's end onto another bar to make that one start after it. Tasks that follow a moved task move with it; dragging a follower detaches it (with an Undo). The Mermaid text stays in sync and rerenders as you type. *Limits*: the visual editor needs `dateFormat YYYY-MM-DD` (other formats open as text only); bars show calendar days, so `excludes weekends` is applied by the preview but not by the bars; tasks and sections can't be reordered by dragging yet.

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
- Edit the code box and click *Apply to canvas* to change the diagram from text
- *Save project* / *Open project* keep exact node positions as a `.json` (Mermaid text itself has no positions)
- Dark / light mode toggle (follows your system by default, remembers your choice)
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z)

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
npm test         # unit tests (converters, parsers, import/export logic)
npm run e2e      # end-to-end tests in a real browser (needs `npx playwright install chromium` once)
npm run build
```

## Deploy (GitHub Pages)
Pushing to `main` runs `.github/workflows/deploy.yml`. One-time setup:
**Repo → Settings → Pages → Source: GitHub Actions**.

## Versioning
The version shown in the app footer comes from `version` in `package.json`. Bump it with each release.
