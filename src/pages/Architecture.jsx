import { ArrowDownUp, ArrowLeft, ArrowRight } from 'lucide-react';

import { Badge, Card, CardHead, PageHeader } from '../components/ui.jsx';

const owners = [
  { tone: 'purple', who: 'Storefront', what: 'The order and the customer: what was bought, where it goes, how it is paid.' },
  { tone: 'orange', who: 'WMS', what: 'The stock: how many are there, and what has been picked, packed and dispatched.' },
  { tone: 'teal', who: 'Courier', what: 'The shipment: the AWB, every scan, delivered or coming back.' },
  { tone: 'blue', who: 'Our database', what: 'The link between all three, and one view of the order.' },
];

function Box({ tone, title, items, note }) {
  return (
    <div className={`archBox ${tone}`}>
      <b>{title}</b>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
      {note && <small>{note}</small>}
    </div>
  );
}

function Link({ out, back }) {
  return (
    <div className="archLink">
      <span>
        {out} <ArrowRight size={14} />
      </span>
      <span>
        <ArrowLeft size={14} /> {back}
      </span>
    </div>
  );
}

export default function Architecture() {
  return (
    <>
      <PageHeader
        title="Architecture"
        desc="A small integration service and one PostgreSQL database sit between the storefronts on one side and the warehouse systems and couriers on the other."
      />

      <Card>
        <div className="arch">
          <div className="archColumn">
            <Box tone="purple" title="Storefronts" items={['Shopify', 'WooCommerce']} />
          </div>

          <Link out="orders" back="tracking, stock" />

          <div className="archColumn">
            <Box
              tone="blue"
              title="Integration service"
              items={['Receives webhooks', 'Polls on a schedule', 'One translator per provider', 'Sends our updates, retries on failure']}
            />
            <div className="archDown">
              <ArrowDownUp size={15} /> reads and writes
            </div>
            <Box
              tone="green"
              title="PostgreSQL"
              items={['orders · order_items', 'inventory', 'shipments · tracking_events', 'inbound_events · outbound_jobs · sync_cursors']}
            />
          </div>

          <div className="archLinks">
            <Link out="orders" back="packages, stock" />
            <Link out="shipments, pickups" back="AWB, scans" />
          </div>

          <div className="archColumn">
            <Box tone="orange" title="Warehouse systems" items={['Unicommerce', 'EasyEcom']} />
            <Box tone="teal" title="Couriers" items={['Delhivery', 'Shiprocket']} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Who owns which fact" desc="Each fact has one owner. We copy it, we never overrule it." />
        <div className="owners">
          {owners.map((owner) => (
            <div key={owner.who}>
              <Badge tone={owner.tone}>{owner.who}</Badge>
              <span>{owner.what}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
