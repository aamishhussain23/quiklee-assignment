import test from 'node:test';
import assert from 'node:assert/strict';

import { steps } from '../data/flow.js';
import { findEndpoint } from '../data/providers.js';
import { tableByName } from '../data/schema.js';
import { STEPS, advance, createSim, diffDb, orderTimeline, replayWebhook, seedDb, sellable } from './engine.js';

const NOW = Date.parse('2026-10-08T10:00:00Z');
const shopifyOrder = { source: 'shopify', city: 'Hyderabad', courier: 'delhivery' };
const stock = (db) => db.inventory.find((r) => r.id === 'GLOW-CRM-50@HYD-DS-01');

function run(db, scenario, upTo = STEPS.length) {
  let sim = createSim(db, scenario, NOW);
  for (let i = 0; i < upTo; i += 1) ({ db, sim } = advance(db, sim));
  return { db, sim };
}

test('the sample data is consistent with itself', () => {
  const db = seedDb(NOW);
  for (const shipment of db.shipments) {
    assert.ok(db.orders.some((o) => o.id === shipment.order_id), `${shipment.id} has an order`);
  }
  for (const row of db.inventory) {
    assert.ok(row.on_hand >= 0 && row.reserved >= 0 && row.reserved <= row.on_hand, row.id);
  }
  // Reserved stock is exactly the open orders that have not left yet.
  const reserved = db.inventory.reduce((sum, r) => sum + r.reserved, 0);
  const waiting = db.orders
    .filter((o) => ['allocated', 'packed'].includes(o.status))
    .flatMap((o) => db.order_items.filter((i) => i.order_id === o.id))
    .reduce((sum, i) => sum + i.qty, 0);
  assert.equal(reserved, waiting);
});

test('an order goes to the dark store in the customer\'s city', () => {
  const hyderabad = run(seedDb(NOW), shopifyOrder, 3);
  assert.equal(hyderabad.db.orders.at(-1).warehouse_id, 'HYD-DS-01');
  const bengaluru = run(seedDb(NOW), { ...shopifyOrder, city: 'Bengaluru' }, 3);
  assert.equal(bengaluru.db.orders.at(-1).warehouse_id, 'BLR-DS-01');
});

test('a delivered order takes one unit out and leaves nothing reserved', () => {
  const seed = seedDb(NOW);
  const { db, sim } = run(seed, shopifyOrder);
  assert.equal(db.orders.find((o) => o.id === sim.order_id).status, 'delivered');
  assert.equal(stock(db).on_hand, stock(seed).on_hand - 1);
  assert.equal(stock(db).reserved, stock(seed).reserved);
});

test('dispatch does not change the sellable number', () => {
  const packed = run(seedDb(NOW), shopifyOrder, 5);
  const dispatched = advance(packed.db, packed.sim);
  assert.equal(sellable(stock(dispatched.db)), sellable(stock(packed.db)));
  assert.equal(stock(dispatched.db).on_hand, stock(packed.db).on_hand - 1);
});

test('an RTO puts the unit back and tells the storefront', () => {
  const seed = seedDb(NOW);
  const { db, sim } = run(seed, { ...shopifyOrder, outcome: 'rto' });
  assert.equal(db.orders.find((o) => o.id === sim.order_id).status, 'rto');
  assert.equal(stock(db).on_hand, stock(seed).on_hand);
  const push = db.outbound_jobs.at(-1);
  assert.equal(push.kind, 'push_stock_to_store');
  assert.equal(push.target, 'shopify');
});

test('a webhook delivered twice does not create a second order', () => {
  const { db, sim } = run(seedDb(NOW), shopifyOrder, 2);
  const replayed = replayWebhook(db, sim, NOW);
  assert.equal(replayed.orders.length, db.orders.length);
  assert.equal(replayed.inbound_events.at(-1).status, 'duplicate');
});

test('two orders from one location on one day share a single pickup request', () => {
  let db = seedDb(NOW);
  const pickups = (d) => d.outbound_jobs.filter((j) => j.kind === 'request_pickup').length;
  const before = pickups(db);
  ({ db } = run(db, shopifyOrder, 6));
  ({ db } = run(db, shopifyOrder, 6));
  assert.equal(pickups(db), before + 1);
});

test('a step reports exactly the rows it wrote', () => {
  const received = run(seedDb(NOW), { source: 'woocommerce', city: 'Bengaluru', courier: 'shiprocket' }, 1);
  const saved = advance(received.db, received.sim);
  const diff = diffDb(received.db, saved.db);
  assert.deepEqual(diff.map((d) => d.table), ['inbound_events', 'orders', 'order_items']);
  assert.equal(diff[1].inserted[0].id, saved.sim.order_id);
});

test('the timeline of an order is in time order', () => {
  const db = seedDb(NOW);
  const rto = db.orders.find((o) => o.status === 'rto');
  const timeline = orderTimeline(db, rto.id);
  const times = timeline.map((e) => e.at);
  assert.deepEqual(times, [...times].sort());
  assert.equal(timeline.at(-1).title, 'Stock sent to the storefront');
});

// The next three keep the explanation honest: what the screens say has to be
// what the engine does.

test('every call a step shows is a real endpoint, and every table it names exists', () => {
  for (const step of steps) {
    for (const source of ['shopify', 'woocommerce'])
      for (const wms of ['unicommerce', 'easyecom'])
        for (const courier of ['delhivery', 'shiprocket'])
          for (const outcome of ['delivered', 'rto']) {
            const context = { source, wms, courier, outcome };
            for (const call of step.calls(context)) {
              assert.ok(findEndpoint(call.provider, call.endpoint), `${step.key}: ${call.provider}/${call.endpoint}`);
            }
            const writes = typeof step.writes === 'function' ? step.writes(context) : step.writes;
            for (const table of writes) assert.ok(tableByName[table], `${step.key}: ${table}`);
          }
  }
  assert.deepEqual(steps.map((s) => s.key), STEPS);
});

test('what each step says it writes is what the engine writes', () => {
  for (const outcome of ['delivered', 'rto']) {
    let db = seedDb(NOW);
    let sim = createSim(db, { ...shopifyOrder, outcome }, NOW);
    for (const step of steps) {
      const result = advance(db, sim);
      const written = diffDb(db, result.db).map((d) => d.table).sort();
      const claimed = (typeof step.writes === 'function' ? step.writes({ outcome }) : step.writes).slice().sort();
      assert.deepEqual(written, claimed, `${step.key} (${outcome})`);
      ({ db, sim } = result);
    }
  }
});

test('the schema lists the same columns the rows actually have', () => {
  const { db } = run(seedDb(NOW), shopifyOrder);
  for (const [name, table] of Object.entries(tableByName)) {
    const row = db[name][0];
    assert.ok(row, `${name} has a row`);
    assert.deepEqual(Object.keys(row).sort(), table.columns.map((c) => c[0]).sort(), name);
  }
});
