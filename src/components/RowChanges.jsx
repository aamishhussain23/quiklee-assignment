import { Database } from 'lucide-react';

import { cell } from '../lib/format.js';

// Which columns are worth showing when a row is inserted. Everything is in the
// Data Model page; this is the one-line version.
const summary = {
  inbound_events: ['id', 'source', 'topic', 'status'],
  orders: ['id', 'external_order_number', 'status', 'payment_mode', 'total_amount', 'shipping_city'],
  order_items: ['order_id', 'sku_id', 'qty', 'unit_price'],
  inventory: ['id', 'on_hand', 'reserved'],
  outbound_jobs: ['id', 'target', 'kind', 'status', 'idempotency_key'],
  shipments: ['id', 'order_id', 'wms_package_code', 'status'],
  tracking_events: ['shipment_id', 'status', 'vendor_status', 'location'],
};

function count(inserted, updated) {
  const parts = [];
  if (inserted.length) parts.push(`${inserted.length} inserted`);
  if (updated.length) parts.push(`${updated.length} updated`);
  return parts.join(' · ');
}

export default function RowChanges({ changes }) {
  if (!changes?.length) return <p className="empty">Nothing was written.</p>;

  return (
    <div className="changes">
      {changes.map(({ table, inserted, updated }) => (
        <div className="change" key={table}>
          <div className="changeHead">
            <a href={`#/data-model/${table}`}>
              <Database size={13} />
              {table}
            </a>
            <span>{count(inserted, updated)}</span>
          </div>

          {inserted.map((row) => (
            <div className="rowLine insert" key={row.id}>
              <span className="op">+</span>
              <div className="pairs">
                {(summary[table] ?? Object.keys(row)).map((column) => (
                  <span key={column}>
                    <i>{column}</i> {cell(row[column])}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {updated.map((row) => (
            <div className="rowLine update" key={row.id}>
              <span className="op">~</span>
              <div className="pairs">
                <span className="rowId">{row.id}</span>
                {row.columns.map(({ column, from, to }) => (
                  <span key={column}>
                    <i>{column}</i> <s>{cell(from)}</s> → <b>{cell(to)}</b>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
