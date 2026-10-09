import { useState } from 'react';
import { ChevronRight, Menu } from 'lucide-react';

import Sidebar, { appName, pageTitle } from './components/Sidebar.jsx';
import { providerById } from './data/providers.js';
import { useRoute } from './lib/route.js';
import ApiExplorer from './pages/ApiExplorer.jsx';
import Architecture from './pages/Architecture.jsx';
import DataModel from './pages/DataModel.jsx';
import Integrations from './pages/Integrations.jsx';
import Landscape from './pages/Landscape.jsx';
import OrderFlow from './pages/OrderFlow.jsx';
import Overview from './pages/Overview.jsx';

const pages = {
  '': Overview,
  landscape: Landscape,
  integrations: Integrations,
  api: ApiExplorer,
  architecture: Architecture,
  'data-model': DataModel,
  flow: OrderFlow,
};

// An API page hangs off an integration, so both read Integrations > Shopify > Order webhooks.
function trail(segments) {
  const [section = '', first, second] = segments;
  if (section !== 'api' && section !== 'integrations') return section ? [{ label: pageTitle(section) }] : [{ label: 'Overview' }];

  const provider = providerById[first] ?? (section === 'api' ? providerById.shopify : null);
  const endpoint = section === 'api' ? (provider.endpoints.find((e) => e.id === second) ?? provider.endpoints[0]) : null;
  return [
    { label: 'Integrations', href: '#/integrations' },
    provider && { label: provider.name, href: `#/integrations/${provider.id}` },
    endpoint && { label: endpoint.title },
  ].filter(Boolean);
}

export default function App() {
  const { segments, query } = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  const section = segments[0] ?? '';
  const Page = pages[section] ?? Overview;
  const crumbs = trail(segments);

  return (
    <div className="app">
      <Sidebar current={section} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main>
        <header className="topbar">
          <button className="menuButton" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <nav className="crumb" aria-label="Breadcrumb">
            <a href="#/">{appName}</a>
            {crumbs.map((crumb, index) => (
              <span className="crumbPart" key={crumb.label}>
                <ChevronRight size={13} />
                {index < crumbs.length - 1 ? <a href={crumb.href}>{crumb.label}</a> : <span>{crumb.label}</span>}
              </span>
            ))}
          </nav>
        </header>

        <div className="content">
          <Page segments={segments.slice(1)} query={query} />
        </div>
      </main>
    </div>
  );
}
