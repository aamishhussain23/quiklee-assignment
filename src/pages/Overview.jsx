import { ArrowRight, Database, Home, PackageCheck, Play, PlugZap, ShoppingCart, Truck } from 'lucide-react';
import { Fragment } from 'react';

import { Card, CardHead, CategoryBadge, PageHeader, ProviderMark } from '../components/ui.jsx';
import { providers } from '../data/providers.js';
import { useStore } from '../store.jsx';

// The six stops on the strip, and the step of the order flow at which each one
// has been reached.
const stops = [
  { name: 'Storefront', label: 'Order placed', icon: ShoppingCart, from: 1 },
  { name: 'Integration', label: 'Translate', icon: PlugZap, from: 2 },
  { name: 'PostgreSQL', label: 'Save', icon: Database, from: 2 },
  { name: 'WMS', label: 'Pick and pack', icon: PackageCheck, from: 4 },
  { name: 'Courier', label: 'Ship', icon: Truck, from: 6 },
  { name: 'Customer', label: 'Deliver', icon: Home, from: 9 },
];

// What the brief asked for, and the screen that answers each part.
const brief = [
  { ask: 'The tools an order passes through', where: 'Landscape', to: '#/landscape' },
  { ask: 'Two website builders, two WMS, two last-mile tools — and the APIs to call', where: 'Integrations', to: '#/integrations' },
  { ask: 'How they all connect to one database', where: 'Architecture', to: '#/architecture' },
  { ask: 'How the data is stored', where: 'Data Model', to: '#/data-model' },
  { ask: 'How the data is fetched from each tool', where: 'Order Flow', to: '#/flow' },
  { ask: 'How it is kept up to date', where: 'Order Flow', to: '#/flow' },
];

export default function Overview() {
  const { sim } = useStore();
  const progress = sim?.step ?? 0;

  return (
    <>
      <PageHeader
        title="Overview"
        desc="One database between the storefronts, the warehouse systems and the couriers. This prototype shows how the data would be fetched, stored and kept up to date."
      >
        <a className="button primary" href="#/flow?autoplay=1">
          <Play size={15} />
          Simulate an order
        </a>
      </PageHeader>

      <Card>
        <CardHead title="What this covers" />
        <div className="briefGrid">
          {brief.map((item) => (
            <a className="briefItem" key={item.ask} href={item.to}>
              <span>{item.ask}</span>
              <b>
                {item.where} <ArrowRight size={13} />
              </b>
            </a>
          ))}
        </div>
      </Card>

      <div className="grid2">
        <Card>
          <CardHead title="An order, end to end" desc="Six stops, nine steps.">
            <a className="button" href="#/flow">
              Open the walkthrough <ArrowRight size={14} />
            </a>
          </CardHead>
          <div className="lifecycle">
            {stops.map((stop, index) => (
              <Fragment key={stop.name}>
                <div className={progress >= stop.from ? 'stop reached' : 'stop'}>
                  <div className="stopIcon">
                    <stop.icon size={18} />
                  </div>
                  <b>{stop.name}</b>
                  <span>{stop.label}</span>
                </div>
                {index < stops.length - 1 && <ArrowRight className="stopArrow" size={16} />}
              </Fragment>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Tools in scope" desc="Two of each." />
          <div className="systemList">
            {providers.map((provider) => (
              <a className="systemRow" key={provider.id} href={`#/integrations/${provider.id}`}>
                <ProviderMark provider={provider} size="small" />
                <b>{provider.name}</b>
                <CategoryBadge category={provider.category} />
              </a>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
