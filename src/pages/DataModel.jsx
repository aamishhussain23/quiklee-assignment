import { ArrowRight, KeyRound } from 'lucide-react';

import { Callout, Card, CardHead, PageHeader } from '../components/ui.jsx';
import { providerById } from '../data/providers.js';
import { groups, tableByName, tables } from '../data/schema.js';
import { cell } from '../lib/format.js';
import { orderView } from '../lib/engine.js';
import { useStore } from '../store.jsx';

const SHOWN_ROWS = 6;

// One real order from the data, to show the three ids it is known by.
function ThreeIds({ db }) {
  const shipment = [...db.shipments].reverse().find((s) => s.awb);
  if (!shipment) return null;
  const { order, warehouse } = orderView(db, shipment.order_id);

  const rows = [
    { system: providerById[order.source].name, role: 'Storefront', calls: order.external_order_number, column: 'orders.external_order_number' },
    { system: 'Our database', role: 'Us', calls: order.id, column: 'orders.id' },
    { system: providerById[warehouse.wms].name, role: `WMS at ${warehouse.id}`, calls: shipment.wms_package_code, column: 'shipments.wms_package_code' },
    { system: shipment.courier_name, role: 'Courier', calls: shipment.awb, column: 'shipments.awb' },
  ];

  return (
    <Card>
      <CardHead
        title="One order, four names"
        desc="Every system has its own id for the same order. Ours is the only one that knows all of them."
      />
      <div className="idMap">
        {rows.map((row) => (
          <div className={row.role === 'Us' ? 'idMapRow ours' : 'idMapRow'} key={row.column}>
            <div>
              <b>{row.system}</b>
              <span>{row.role}</span>
            </div>
            <code className="idValue">{row.calls}</code>
            <ArrowRight size={15} />
            <code>{row.column}</code>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function DataModel({ segments }) {
  const { db } = useStore();
  const table = tableByName[segments[0]] ?? tableByName.orders;
  const rows = db[table.name];
  const latest = rows.slice(-SHOWN_ROWS).reverse();

  return (
    <>
      <PageHeader
        title="Data model"
        desc="Ten tables in PostgreSQL. Whatever a provider sends is translated into this shape as it comes in, with the provider's own id kept next to ours."
      />

      <ThreeIds db={db} />

      <div className="schema">
        <Card className="schemaNav">
          {Object.entries(groups).map(([id, label]) => (
            <div key={id}>
              <div className="navLabel">{label}</div>
              {tables
                .filter((t) => t.group === id)
                .map((t) => (
                  <a key={t.name} href={`#/data-model/${t.name}`} className={t.name === table.name ? 'on' : ''}>
                    <span>{t.name}</span>
                    <small>{db[t.name].length}</small>
                  </a>
                ))}
            </div>
          ))}
        </Card>

        <Card>
          <CardHead title={table.name} desc={table.purpose} />

          {table.unique && (
            <Callout icon={KeyRound} title={table.unique}>
              {table.why}
            </Callout>
          )}
          {!table.unique && <p className="cardNote">{table.why}</p>}

          <div className="tableWrap">
            <table className="columns">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Type</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map(([name, type, note]) => (
                  <tr key={name}>
                    <td>
                      <code>{name}</code>
                    </td>
                    <td className="type">{type}</td>
                    <td>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="subhead">
            Rows right now <small>{rows.length > SHOWN_ROWS ? `latest ${SHOWN_ROWS} of ${rows.length}` : rows.length}</small>
          </h4>
          <div className="tableWrap">
            <table className="rows">
              <thead>
                <tr>
                  {table.columns.map(([name]) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latest.map((row) => (
                  <tr key={row.id}>
                    {table.columns.map(([name]) => (
                      <td key={name} className={row[name] === null ? 'null' : ''}>
                        {cell(row[name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="finePrint">
            These are the rows the prototype holds in memory. Run an order on the Order Flow page and they change.
          </p>
        </Card>
      </div>
    </>
  );
}
