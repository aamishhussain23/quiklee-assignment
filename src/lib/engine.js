// An in-memory version of the database in data/schema.js, and the nine steps
// that move one order through it.
//
// Every operation returns a new db instead of changing the old one, so the UI
// can compare "before" and "after" and show which rows a step writes. Nothing
// here talks to a provider — each step writes the rows the real worker would
// write once the provider call had succeeded.

import { providerById } from '../data/providers.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms) => new Date(ms).toISOString();

// What each storefront sells in the sample data, and its default order.
export const STORES = {
  shopify: { brand: 'Glow Skincare', sku: 'GLOW-CRM-50', price: 999, payment_mode: 'cod' },
  woocommerce: { brand: 'Brew & Bean', sku: 'BREW-BEAN-250', price: 449, payment_mode: 'prepaid' },
};

export const CITIES = {
  Hyderabad: { pincode: '500081' },
  Bengaluru: { pincode: '560034' },
};

const CUSTOMERS = ['Imran K.', 'Riya S.', 'Karthik R.', 'Ananya M.', 'Sneha P.', 'Vikram T.', 'Divya N.', 'Arjun B.'];

export const STEPS = ['received', 'saved', 'sent_to_wms', 'packed', 'awb', 'dispatched', 'in_transit', 'store_told', 'closed'];

// Time from the order being placed to each step. Only there to give the
// timeline believable gaps.
const OFFSETS = [0, 1_000, 3_000, 18 * MIN, 19 * MIN, 55 * MIN, 3 * HOUR, 3 * HOUR + 2_000, 26 * HOUR];

// The order tables are listed in, wherever rows are shown.
export const TABLE_ORDER = [
  'inbound_events',
  'orders',
  'order_items',
  'inventory',
  'outbound_jobs',
  'shipments',
  'tracking_events',
  'sync_cursors',
  'skus',
  'warehouses',
];

// What each courier calls our statuses: the text it sends, and its code.
// Shiprocket's code is the shipment_status_id from its status table.
const VENDOR_STATUS = {
  delhivery: {
    picked_up: ['In Transit', 'UD'],
    in_transit: ['In Transit', 'UD'],
    out_for_delivery: ['Dispatched', 'UD'],
    delivered: ['Delivered', 'DL'],
    rto_initiated: ['RTO', 'RT'],
    rto_delivered: ['RTO', 'RT'],
  },
  shiprocket: {
    picked_up: ['PICKED UP', '42'],
    in_transit: ['IN TRANSIT', '18'],
    out_for_delivery: ['OUT FOR DELIVERY', '17'],
    delivered: ['DELIVERED', '7'],
    rto_initiated: ['RTO INITIATED', '9'],
    rto_delivered: ['RTO DELIVERED', '10'],
  },
};

// ── small helpers ────────────────────────────────────────────────────────────

const byId = (rows, id) => rows.find((r) => r.id === id);
const nextId = (rows, prefix, start) => `${prefix}-${start + rows.length + 1}`;
const stockRow = (db, skuId, warehouseId) => byId(db.inventory, `${skuId}@${warehouseId}`);

export const sellable = (row) => row.on_hand - row.reserved;

function addJob(db, { at, ...job }) {
  db.outbound_jobs.push({
    id: nextId(db.outbound_jobs, 'JOB', 7000),
    attempts: 1,
    status: 'done',
    created_at: iso(at),
    done_at: iso(at),
    ...job,
  });
}

function addInbound(db, { at, status = 'processed', ...event }) {
  db.inbound_events.push({
    id: nextId(db.inbound_events, 'EVT', 5000),
    status,
    received_at: iso(at),
    processed_at: status === 'received' ? null : iso(at),
    ...event,
  });
}

function addScan(db, shipment, status, at, location) {
  const [vendor_status, vendor_status_code] = VENDOR_STATUS[shipment.courier][status];
  addInbound(db, {
    at,
    source: shipment.courier,
    topic: shipment.courier === 'delhivery' ? 'Scan push' : 'Tracking webhook',
    vendor_event_id: `${shipment.awb}:${vendor_status_code}:${iso(at)}`,
    order_id: shipment.order_id,
    note: `AWB ${shipment.awb} — ${vendor_status}`,
  });
  db.tracking_events.push({
    id: nextId(db.tracking_events, 'TRK', 9000),
    shipment_id: shipment.id,
    status,
    vendor_status,
    vendor_status_code,
    location,
    occurred_at: iso(at),
  });
  shipment.status = status;
}

// Nearest location that can fulfil the line: same city first, and a dark store
// before a fulfilment centre.
function allocate(db, city, skuId, qty) {
  const rank = (w) => (w.city === city ? 0 : 2) + (w.type === 'dark_store' ? 0 : 1);
  const withStock = db.warehouses.filter((w) => {
    const row = stockRow(db, skuId, w.id);
    return row && sellable(row) >= qty;
  });
  return withStock.sort((a, b) => rank(a) - rank(b))[0];
}

// ── the nine steps ───────────────────────────────────────────────────────────

const handlers = {
  // 1. The storefront's webhook arrives. Only the event is stored.
  received(db, sim, at) {
    addInbound(db, {
      at,
      status: 'received',
      source: sim.scenario.source,
      topic: sim.scenario.source === 'shopify' ? 'orders/create' : 'order.created',
      vendor_event_id: sim.vendor_event_id,
      order_id: null,
      note: `Order ${sim.external_order_number} — signature checked, saved, 200 returned`,
    });
  },

  // 2. A worker maps the payload to our shape and saves the order.
  saved(db, sim, at) {
    const { scenario } = sim;
    const id = nextId(db.orders, 'ORD', 10020);
    const total = scenario.price * scenario.qty;

    db.orders.push({
      id,
      brand: STORES[scenario.source].brand,
      source: scenario.source,
      external_order_id: sim.external_order_id,
      external_order_number: sim.external_order_number,
      status: 'new',
      payment_mode: scenario.payment_mode,
      cod_amount: scenario.payment_mode === 'cod' ? total : 0,
      total_amount: total,
      customer_name: sim.customer_name,
      shipping_city: scenario.city,
      shipping_pincode: CITIES[scenario.city].pincode,
      warehouse_id: null,
      placed_at: iso(sim.started_at),
      updated_at: iso(at),
    });
    db.order_items.push({
      id: `${id}-1`,
      order_id: id,
      sku_id: scenario.sku,
      qty: scenario.qty,
      unit_price: scenario.price,
      external_line_id: scenario.source === 'shopify' ? `gid://shopify/FulfillmentOrder/${7700 + db.orders.length}` : null,
    });

    const event = db.inbound_events.find((e) => e.vendor_event_id === sim.vendor_event_id && e.status === 'received');
    Object.assign(event, { status: 'processed', processed_at: iso(at), order_id: id });
    return { order_id: id };
  },

  // 3. Pick a location, reserve the stock, create the order in that WMS.
  sent_to_wms(db, sim, at) {
    const order = byId(db.orders, sim.order_id);
    const item = db.order_items.find((i) => i.order_id === order.id);
    const warehouse = allocate(db, order.shipping_city, item.sku_id, item.qty);
    const row = stockRow(db, item.sku_id, warehouse.id);

    row.reserved += item.qty;
    row.note = `Reserved for ${order.id}`;
    Object.assign(order, { warehouse_id: warehouse.id, status: 'allocated', updated_at: iso(at) });

    addJob(db, {
      at,
      target: warehouse.wms,
      kind: 'push_order_to_wms',
      order_id: order.id,
      idempotency_key: `wms:order:${order.id}`,
      note: `Order ${order.id} created at ${warehouse.id}`,
    });
  },

  // 4. The WMS reports the package is packed.
  packed(db, sim, at) {
    const order = byId(db.orders, sim.order_id);
    const warehouse = byId(db.warehouses, order.warehouse_id);
    const uniware = warehouse.wms === 'unicommerce';
    const n = db.shipments.length;
    const id = nextId(db.shipments, 'SHP', 20030);
    const code = uniware ? `SP-${88213 + n}` : `INV-${771204 + n * 3}`;

    addInbound(db, {
      at,
      source: warehouse.wms,
      topic: uniware ? 'Shipment packed' : 'Ready to dispatch',
      vendor_event_id: `${code}:packed`,
      order_id: order.id,
      note: `Package ${code} packed at ${warehouse.id}`,
    });
    db.shipments.push({
      id,
      order_id: order.id,
      warehouse_id: warehouse.id,
      wms_package_code: code,
      courier: null,
      courier_name: null,
      awb: null,
      status: 'packed',
      label_url: null,
      packed_at: iso(at),
      dispatched_at: null,
      delivered_at: null,
      store_notified_at: null,
    });
    Object.assign(order, { status: 'packed', updated_at: iso(at) });
    return { shipment_id: id };
  },

  // 5. Book the shipment with the courier and keep the AWB and label.
  awb(db, sim, at) {
    const shipment = byId(db.shipments, sim.shipment_id);
    const courier = sim.scenario.courier;
    const n = db.shipments.filter((s) => s.awb).length;
    const awb = String((courier === 'delhivery' ? 1490810000037 : 2871000000074) + n * 37);
    // An aggregator answers with whichever carrier it chose.
    const carrier = courier === 'delhivery' ? 'Delhivery' : 'Ecom Express';

    Object.assign(shipment, {
      courier,
      courier_name: carrier,
      awb,
      status: 'manifested',
      label_url: `labels/${shipment.id}.pdf`,
    });
    addJob(db, {
      at,
      target: courier,
      kind: 'create_shipment',
      order_id: shipment.order_id,
      idempotency_key: `courier:shipment:${shipment.id}`,
      note: `AWB ${awb}${courier === 'shiprocket' ? ` (${carrier})` : ''}, label saved`,
    });
  },

  // 6. Pickup is booked, the courier collects, the WMS marks it dispatched.
  dispatched(db, sim, at) {
    const shipment = byId(db.shipments, sim.shipment_id);
    const order = byId(db.orders, shipment.order_id);
    const item = db.order_items.find((i) => i.order_id === order.id);
    const warehouse = byId(db.warehouses, shipment.warehouse_id);

    // One pickup per courier, per location, per day. The key carries all three,
    // so the second order of the day finds the job already there.
    const requested = at - 20 * MIN;
    const day = iso(requested).slice(0, 10);
    const key = `pickup:${shipment.courier}:${warehouse.id}:${day}`;
    if (!db.outbound_jobs.some((j) => j.idempotency_key === key)) {
      addJob(db, {
        at: requested,
        target: shipment.courier,
        kind: 'request_pickup',
        order_id: order.id,
        idempotency_key: key,
        note: `Pickup booked at ${warehouse.id} for ${day}`,
      });
    }

    addInbound(db, {
      at,
      source: warehouse.wms,
      topic: warehouse.wms === 'unicommerce' ? 'Shipment dispatched' : 'Manifested',
      vendor_event_id: `${shipment.wms_package_code}:dispatched`,
      order_id: order.id,
      note: `Package ${shipment.wms_package_code} handed to ${shipment.courier_name}`,
    });
    addScan(db, shipment, 'picked_up', at, `${warehouse.city} pickup`);
    shipment.dispatched_at = iso(at);

    // Stock leaves the building: on hand and reserved drop together, so the
    // sellable number does not change.
    const row = stockRow(db, item.sku_id, warehouse.id);
    row.on_hand -= item.qty;
    row.reserved -= item.qty;
    row.wms_snapshot_at = iso(at);
    row.note = `${order.id} dispatched`;

    Object.assign(order, { status: 'shipped', updated_at: iso(at) });
  },

  // 7. The first scan on the road.
  in_transit(db, sim, at) {
    const shipment = byId(db.shipments, sim.shipment_id);
    const order = byId(db.orders, shipment.order_id);
    addScan(db, shipment, 'in_transit', at, `${order.shipping_city} hub`);
  },

  // 8. The storefront is told once the box is moving.
  store_told(db, sim, at) {
    const shipment = byId(db.shipments, sim.shipment_id);
    const order = byId(db.orders, shipment.order_id);
    addJob(db, {
      at,
      target: order.source,
      kind: 'push_tracking_to_store',
      order_id: order.id,
      idempotency_key: `store:tracking:${shipment.id}`,
      note:
        order.source === 'shopify'
          ? `fulfillmentCreate with AWB ${shipment.awb} — customer notified`
          : `Order ${order.external_order_number} updated with AWB ${shipment.awb}`,
    });
    shipment.store_notified_at = iso(at);
  },

  // 9. Delivered — or the box comes back.
  closed(db, sim, at) {
    const shipment = byId(db.shipments, sim.shipment_id);
    const order = byId(db.orders, shipment.order_id);

    if (sim.scenario.outcome !== 'rto') {
      addScan(db, shipment, 'out_for_delivery', at - 3 * HOUR, order.shipping_city);
      addScan(db, shipment, 'delivered', at, order.shipping_city);
      shipment.delivered_at = iso(at);
      Object.assign(order, { status: 'delivered', updated_at: iso(at) });
      return;
    }

    const warehouse = byId(db.warehouses, shipment.warehouse_id);
    const item = db.order_items.find((i) => i.order_id === order.id);
    const back = at + 46 * HOUR;
    const putAway = back + HOUR;
    addScan(db, shipment, 'out_for_delivery', at - 4 * HOUR, order.shipping_city);
    addScan(db, shipment, 'rto_initiated', at, `${order.shipping_city} — customer unavailable, returning`);
    addScan(db, shipment, 'rto_delivered', back, `${warehouse.city} — back at the warehouse`);

    addInbound(db, {
      at: putAway,
      source: warehouse.wms,
      topic: warehouse.wms === 'unicommerce' ? 'Return completed' : 'Mark return',
      vendor_event_id: `${shipment.wms_package_code}:returned`,
      order_id: order.id,
      note: `Returned box received and put away at ${warehouse.id}`,
    });

    // The stock comes back through the WMS — we do not add it ourselves — and
    // only then is the storefront given the new number. Shopify takes one
    // number per location; WooCommerce has one per product, so it gets the total.
    const row = stockRow(db, item.sku_id, warehouse.id);
    row.on_hand += item.qty;
    row.wms_snapshot_at = iso(putAway);
    row.note = `Return from ${order.id} put away`;

    const total = db.inventory.filter((r) => r.sku_id === item.sku_id).reduce((sum, r) => sum + sellable(r), 0);
    addJob(db, {
      at: putAway + 1_000,
      target: order.source,
      kind: 'push_stock_to_store',
      order_id: order.id,
      idempotency_key: `stock:${row.id}:${row.wms_snapshot_at}`,
      note:
        order.source === 'shopify'
          ? `${item.sku_id} at ${warehouse.id}: sellable is ${sellable(row)}`
          : `${item.sku_id}: total across locations is ${total}`,
    });

    Object.assign(order, { status: 'rto', updated_at: iso(back) });
  },
};

// ── running an order ─────────────────────────────────────────────────────────

export function createSim(db, scenario, now) {
  const store = STORES[scenario.source];
  const count = db.orders.filter((o) => o.source === scenario.source).length;
  const number = scenario.source === 'shopify' ? 4521 + count * 2 : 9812 + count * 7;
  const shopify = scenario.source === 'shopify';

  return {
    scenario: {
      qty: 1,
      outcome: 'delivered',
      sku: store.sku,
      price: store.price,
      payment_mode: store.payment_mode,
      ...scenario,
    },
    external_order_id: shopify ? `gid://shopify/Order/${5521870000 + number}` : String(number),
    external_order_number: shopify ? `#${number}` : String(number),
    vendor_event_id: shopify ? `wh-${number}-a1` : `dlv-${number}-1`,
    customer_name: CUSTOMERS[db.orders.length % CUSTOMERS.length],
    order_id: null,
    shipment_id: null,
    step: 0,
    started_at: now,
  };
}

export function advance(db, sim) {
  if (sim.step >= STEPS.length) return { db, sim, key: null, at: null };
  const next = structuredClone(db);
  const key = STEPS[sim.step];
  const at = sim.started_at + OFFSETS[sim.step];
  const patch = handlers[key](next, sim, at) ?? {};
  return { db: next, sim: { ...sim, ...patch, step: sim.step + 1 }, key, at };
}

// The same webhook delivered a second time. The unique key on
// (source, vendor_event_id) is what makes this a no-op.
export function replayWebhook(db, sim, now) {
  const next = structuredClone(db);
  const first = next.inbound_events.find((e) => e.vendor_event_id === sim.vendor_event_id);
  addInbound(next, {
    at: now,
    status: 'duplicate',
    source: sim.scenario.source,
    topic: first.topic,
    vendor_event_id: sim.vendor_event_id,
    order_id: sim.order_id,
    note: `Same event id as ${first.id} — acknowledged, nothing written`,
  });
  return next;
}

// ── reading the db ───────────────────────────────────────────────────────────

export function orderView(db, orderId) {
  const order = byId(db.orders, orderId);
  if (!order) return null;
  return {
    order,
    items: db.order_items.filter((i) => i.order_id === orderId).map((i) => ({ ...i, sku: byId(db.skus, i.sku_id) })),
    shipment: db.shipments.find((s) => s.order_id === orderId) ?? null,
    warehouse: order.warehouse_id ? byId(db.warehouses, order.warehouse_id) : null,
  };
}

const JOB_TITLES = {
  push_order_to_wms: 'Order sent to the WMS',
  create_shipment: 'Shipment booked',
  request_pickup: 'Pickup requested',
  push_tracking_to_store: 'Tracking sent to the storefront',
  push_stock_to_store: 'Stock sent to the storefront',
};

const SCAN_TITLES = {
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  rto_initiated: 'RTO started',
  rto_delivered: 'Returned to the warehouse',
};

// There is no separate history table. An order's history is read from the three
// tables that already record everything that happened to it.
export function orderTimeline(db, orderId) {
  const name = (id) => providerById[id].name;
  const entries = [];

  for (const e of db.inbound_events.filter((x) => x.order_id === orderId)) {
    const category = providerById[e.source].category;
    if (category === 'courier') continue; // shown as tracking events below
    if (e.status === 'duplicate') {
      entries.push({ at: e.received_at, system: name(e.source), title: 'Duplicate webhook ignored', detail: e.note, table: 'inbound_events', tone: 'gray' });
      continue;
    }
    entries.push({
      at: e.received_at,
      system: name(e.source),
      title: category === 'storefront' ? `Webhook ${e.topic}` : e.topic,
      detail: e.note,
      table: 'inbound_events',
      tone: 'blue',
    });
    if (category === 'storefront' && e.processed_at) {
      entries.push({ at: e.processed_at, system: 'Us', title: `Saved as ${orderId}`, detail: 'Mapped to our order shape', table: 'orders', tone: 'blue' });
    }
  }

  for (const j of db.outbound_jobs.filter((x) => x.order_id === orderId)) {
    entries.push({ at: j.created_at, system: name(j.target), title: JOB_TITLES[j.kind], detail: j.note, table: 'outbound_jobs', tone: 'green' });
  }

  for (const s of db.shipments.filter((x) => x.order_id === orderId)) {
    for (const t of db.tracking_events.filter((x) => x.shipment_id === s.id)) {
      entries.push({
        at: t.occurred_at,
        system: s.courier_name,
        title: SCAN_TITLES[t.status],
        detail: `${t.location} · courier says "${t.vendor_status}"`,
        table: 'tracking_events',
        tone: t.status === 'delivered' ? 'green' : t.status.startsWith('rto') ? 'red' : 'blue',
      });
    }
  }

  return entries
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index);
}

// Rows added and columns changed between two versions of the db.
export function diffDb(before, after) {
  const changes = [];
  for (const table of TABLE_ORDER) {
    const old = new Map(before[table].map((row) => [row.id, row]));
    const inserted = [];
    const updated = [];
    for (const row of after[table]) {
      const prev = old.get(row.id);
      if (!prev) {
        inserted.push(row);
        continue;
      }
      const columns = Object.keys(row)
        .filter((column) => row[column] !== prev[column])
        .map((column) => ({ column, from: prev[column], to: row[column] }));
      if (columns.length) updated.push({ id: row.id, columns });
    }
    if (inserted.length || updated.length) changes.push({ table, inserted, updated });
  }
  return changes;
}

// ── sample data ──────────────────────────────────────────────────────────────

function emptyDb(now) {
  const opening = iso(now - 5 * 24 * HOUR);
  const stock = (sku_id, warehouse_id, on_hand) => ({
    id: `${sku_id}@${warehouse_id}`,
    sku_id,
    warehouse_id,
    on_hand,
    reserved: 0,
    wms_snapshot_at: opening,
    note: 'Opening stock',
  });
  const cursor = (source, stream, every, minutesAgo) => ({
    id: `${source}:${stream}`,
    source,
    stream,
    cursor: iso(now - minutesAgo * MIN),
    every,
    last_run_at: iso(now - minutesAgo * MIN),
  });

  return {
    warehouses: [
      { id: 'HYD-DS-01', name: 'Madhapur dark store', city: 'Hyderabad', pincode: '500081', type: 'dark_store', wms: 'unicommerce', wms_code: 'HYDDS01', courier_pickup_name: 'QUIKLEE-HYD-DS-01' },
      { id: 'HYD-FC-01', name: 'Shamshabad fulfilment centre', city: 'Hyderabad', pincode: '501218', type: 'fulfilment_centre', wms: 'unicommerce', wms_code: 'HYDFC01', courier_pickup_name: 'QUIKLEE-HYD-FC-01' },
      { id: 'BLR-DS-01', name: 'Koramangala dark store', city: 'Bengaluru', pincode: '560034', type: 'dark_store', wms: 'easyecom', wms_code: 'blr-ds-01', courier_pickup_name: 'QUIKLEE-BLR-DS-01' },
      { id: 'BLR-FC-01', name: 'Hoskote fulfilment centre', city: 'Bengaluru', pincode: '562114', type: 'fulfilment_centre', wms: 'easyecom', wms_code: 'blr-fc-01', courier_pickup_name: 'QUIKLEE-BLR-FC-01' },
    ],
    skus: [
      { id: 'GLOW-CRM-50', brand: 'Glow Skincare', name: 'Face Cream 50 g', hsn_code: '3304', weight_g: 180, store_item_id: 'gid://shopify/InventoryItem/9911' },
      { id: 'GLOW-SRM-30', brand: 'Glow Skincare', name: 'Vitamin C Serum 30 ml', hsn_code: '3304', weight_g: 120, store_item_id: 'gid://shopify/InventoryItem/9912' },
      { id: 'BREW-BEAN-250', brand: 'Brew & Bean', name: 'Roasted Beans 250 g', hsn_code: '0901', weight_g: 280, store_item_id: 'product 310' },
      { id: 'BREW-COLD-500', brand: 'Brew & Bean', name: 'Cold Brew 500 ml', hsn_code: '2101', weight_g: 560, store_item_id: 'product 311' },
    ],
    inventory: [
      stock('GLOW-CRM-50', 'HYD-DS-01', 40),
      stock('GLOW-CRM-50', 'HYD-FC-01', 600),
      stock('GLOW-CRM-50', 'BLR-DS-01', 25),
      stock('GLOW-SRM-30', 'HYD-DS-01', 6),
      stock('GLOW-SRM-30', 'BLR-DS-01', 18),
      stock('BREW-BEAN-250', 'HYD-DS-01', 12),
      stock('BREW-BEAN-250', 'BLR-DS-01', 30),
      stock('BREW-BEAN-250', 'BLR-FC-01', 400),
      stock('BREW-COLD-500', 'BLR-DS-01', 14),
    ],
    orders: [],
    order_items: [],
    shipments: [],
    tracking_events: [],
    inbound_events: [],
    outbound_jobs: [],
    sync_cursors: [
      cursor('shopify', 'orders', '5 min', 3),
      cursor('woocommerce', 'orders', '5 min', 4),
      cursor('unicommerce', 'packages', '10 min', 6),
      cursor('unicommerce', 'inventory', '30 min', 25),
      cursor('easyecom', 'orders', '10 min', 2),
      cursor('easyecom', 'inventory', '30 min', 25),
      cursor('delhivery', 'tracking', '15 min', 11),
      cursor('shiprocket', 'tracking', '15 min', 9),
    ],
  };
}

// The sample data is not typed in by hand: it is four orders run through the
// same steps and stopped at different points. That keeps every table
// consistent with every other one.
export function seedDb(now = Date.now()) {
  let db = emptyDb(now);
  const run = (scenario, startedAgo, steps) => {
    let sim = createSim(db, scenario, now - startedAgo);
    for (let i = 0; i < steps; i += 1) ({ db, sim } = advance(db, sim));
  };

  // Came back: a COD order the customer was not home for.
  run({ source: 'woocommerce', city: 'Hyderabad', courier: 'delhivery', outcome: 'rto', payment_mode: 'cod' }, 4 * 24 * HOUR, 9);
  // Delivered yesterday.
  run({ source: 'shopify', city: 'Hyderabad', courier: 'delhivery' }, 30 * HOUR, 9);
  // On the road.
  run({ source: 'woocommerce', city: 'Bengaluru', courier: 'shiprocket', sku: 'BREW-COLD-500', price: 649, qty: 2 }, 5 * HOUR, 8);
  // Packed and labelled, waiting for the pickup.
  run({ source: 'shopify', city: 'Bengaluru', courier: 'shiprocket', qty: 2, payment_mode: 'prepaid' }, 40 * MIN, 5);

  return db;
}
