import { Boxes, Database, LayoutDashboard, Map, PlugZap, Route, Workflow, X } from 'lucide-react';

// In the order the brief was given: the tools, their APIs, how they connect,
// how the data is stored, how it is kept up to date.
const items = [
  { path: '', label: 'Overview', icon: LayoutDashboard },
  { path: 'landscape', label: 'Landscape', icon: Map },
  { path: 'integrations', label: 'Integrations', icon: PlugZap },
  { path: 'architecture', label: 'Architecture', icon: Workflow },
  { path: 'data-model', label: 'Data Model', icon: Database },
  { path: 'flow', label: 'Order Flow', icon: Route },
];

const titles = Object.fromEntries(items.map((item) => [item.path, item.label]));

export const pageTitle = (path) => titles[path] ?? 'Overview';

// The one place the name is written. index.html carries it too, for the browser tab.
export const appName = 'Order Integration';

export default function Sidebar({ current, open, onClose }) {
  // An API page is reached from an integration, so it lights up that entry.
  const active = current === 'api' ? 'integrations' : current;

  return (
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <div className="brand">
        <div className="brandMark">
          <Boxes size={20} />
        </div>
        <div>
          <b>{appName}</b>
          <span>Storefront · WMS · Last mile</span>
        </div>
        <button className="menuClose" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <nav>
        {items.map(({ path, label, icon: Icon }) => (
          <a key={path} href={`#/${path}`} className={active === path ? 'active' : ''} onClick={onClose}>
            <Icon size={17} />
            {label}
          </a>
        ))}
      </nav>

      <div className="sidebarFoot">
        <div className="author">
          <div className="avatar">AH</div>
          <b>Aamish Hussain</b>
        </div>
      </div>
    </aside>
  );
}
