import { App as DiagramsPage } from './App';
import { GanttPage } from './gantt/GanttPage';
import { TextPage } from './text/TextPage';
import { useRoute } from './router';
import { toggleTheme, useTheme } from './theme';

/** Top-level frame: one app, separate workspaces for separate jobs. */
export function Shell() {
  const route = useRoute();
  const theme = useTheme();
  const tab = (page: string) => `tab${route.page === page ? ' on' : ''}`;
  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Workspaces">
        <strong className="brand">Diagram → Mermaid</strong>
        <a className={tab('diagrams')} href="#/diagrams" aria-current={route.page === 'diagrams' ? 'page' : undefined}>
          Diagrams <small>flowchart · state · ER</small>
        </a>
        <a className={tab('gantt')} href="#/gantt" aria-current={route.page === 'gantt' ? 'page' : undefined}>
          Gantt <small>plans</small>
        </a>
        <a className={tab('text')} href="#/text" aria-current={route.page === 'text' ? 'page' : undefined}>
          Text <small>any other Mermaid</small>
        </a>
        <span className="spacer" />
        <button onClick={toggleTheme} title="Toggle dark / light mode" aria-pressed={theme === 'dark'}>
          {theme === 'dark' ? '☀ Light mode' : '🌙 Dark mode'}
        </button>
      </nav>
      <div className="shell-page">{route.page === 'gantt' ? <GanttPage /> : route.page === 'text' ? <TextPage /> : <DiagramsPage />}</div>
    </div>
  );
}

