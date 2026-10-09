// The nine steps of an order, as shown on the Order Flow page. The keys match
// STEPS in lib/engine.js; this file is the explanation, that one is the logic.
//
// `calls` names endpoints from data/providers.js by id, so the call shown for a
// step is always the real endpoint of whichever provider the scenario uses.

export const lanes = [
  { id: 'storefront', label: 'Storefront' },
  { id: 'integration', label: 'Integration' },
  { id: 'db', label: 'PostgreSQL' },
  { id: 'wms', label: 'WMS' },
  { id: 'courier', label: 'Courier' },
];

export const steps = [
  {
    key: 'received',
    title: 'Order event received',
    short: 'Received',
    lanes: ['storefront', 'integration', 'db'],
    direction: 'Storefront → us',
    what: 'The storefront calls our webhook as soon as the order is placed. We check the signature, save the event as it came and answer 200. Nothing else happens yet.',
    rule: {
      title: 'Store first, process after',
      text: 'Shopify gives a webhook 5 seconds before counting it as failed, so we save and reply at once. And because the event is saved as it came, a bug on our side means processing it again, not losing the order.',
    },
    calls: ({ source }) => [{ provider: source, endpoint: 'webhook-order', label: 'arrives' }],
    writes: ['inbound_events'],
  },
  {
    key: 'saved',
    title: 'Normalised and saved',
    short: 'Saved',
    lanes: ['integration', 'db'],
    direction: 'Inside our system',
    what: "A worker picks up the stored event, maps the storefront's payload to our order shape and saves it. The storefront's own id is kept beside ours.",
    rule: {
      title: 'One order, however it arrives',
      text: 'UNIQUE (source, external_order_id). The same order coming from the webhook and again from the 5-minute poll is one row, not two.',
    },
    calls: ({ source }) => [{ provider: source, endpoint: 'pull-orders', label: 'safety-net poll, same result' }],
    writes: ['orders', 'order_items', 'inbound_events'],
  },
  {
    key: 'sent_to_wms',
    title: 'Allocated and sent to the warehouse',
    short: 'To WMS',
    lanes: ['db', 'integration', 'wms'],
    direction: 'Us → WMS',
    what: "We pick the nearest location that has the stock — a dark store in the customer's city before a fulfilment centre — reserve the units, and create the order in that location's WMS.",
    rule: {
      title: 'Sending again must not make a second order',
      text: 'Our order id goes in as the WMS order code. If the call times out, we look that code up before trying again, so the warehouse never picks the same order twice.',
    },
    calls: ({ wms }) => [{ provider: wms, endpoint: 'create-order', label: 'create' }],
    writes: ['orders', 'inventory', 'outbound_jobs'],
  },
  {
    key: 'packed',
    title: 'Picked and packed',
    short: 'Packed',
    lanes: ['wms', 'integration', 'db'],
    direction: 'WMS → us',
    what: 'The WMS runs the floor: pick list, scan, pack. When the package is ready it tells us — or we find it on the next poll. This is when the shipment row is created.',
    rule: {
      title: 'Push where it exists, poll everywhere',
      text: 'Where the WMS can notify us, we listen. A poll runs as well, and finds anything a notification missed.',
    },
    calls: ({ wms }) => [
      { provider: wms, endpoint: 'notify-status', label: 'push' },
      { provider: wms, endpoint: 'poll-status', label: 'poll' },
    ],
    writes: ['inbound_events', 'shipments', 'orders'],
  },
  {
    key: 'awb',
    title: 'AWB and label',
    short: 'AWB',
    lanes: ['db', 'integration', 'courier'],
    direction: 'Us → courier',
    what: 'We check the pincode is serviceable for this payment mode, book the shipment, save the AWB the courier returns, and fetch the label for the packing station to print.',
    rule: {
      title: 'Our shipment id is the courier reference',
      text: 'The courier wants a unique reference for each shipment, and we send our own shipment id. If the reply is lost, we find the shipment by that reference instead of booking it twice.',
    },
    calls: ({ courier }) => [
      { provider: courier, endpoint: 'serviceability', label: 'check' },
      { provider: courier, endpoint: 'create-shipment', label: 'book' },
      ...(courier === 'shiprocket' ? [{ provider: courier, endpoint: 'assign-awb', label: 'get AWB' }] : []),
      { provider: courier, endpoint: 'label', label: 'label' },
    ],
    writes: ['shipments', 'outbound_jobs'],
  },
  {
    key: 'dispatched',
    title: 'Pickup and dispatch',
    short: 'Dispatched',
    lanes: ['integration', 'courier', 'wms', 'db'],
    direction: 'Us → courier, WMS → us',
    what: "We book the day's pickup for that location, the courier collects, and the WMS marks the package dispatched. This is the moment stock physically leaves.",
    rule: {
      title: 'Sellable does not move at dispatch',
      text: 'On hand −1 and reserved −1 cancel out, so the number a storefront is sent does not change. There is nothing to push.',
    },
    calls: ({ courier, wms }) => [
      { provider: courier, endpoint: 'pickup', label: 'once per location per day' },
      { provider: wms, endpoint: 'notify-status', label: 'dispatched' },
      { provider: wms, endpoint: 'inventory', label: 'stock after dispatch' },
    ],
    writes: ['outbound_jobs', 'inbound_events', 'tracking_events', 'shipments', 'inventory', 'orders'],
  },
  {
    key: 'in_transit',
    title: 'Tracking scans',
    short: 'In transit',
    lanes: ['courier', 'integration', 'db'],
    direction: 'Courier → us',
    what: 'Every scan the courier records reaches us by push. A poll of the AWBs still open catches anything the push missed.',
    rule: {
      title: 'Scans are only added, never repeated',
      text: 'UNIQUE (shipment_id, vendor_status_code, occurred_at). The same scan from the push and from the poll is one row, and the shipment status is read off the latest one.',
    },
    calls: ({ courier }) => [
      { provider: courier, endpoint: 'webhook-tracking', label: 'push' },
      { provider: courier, endpoint: 'track', label: 'poll' },
    ],
    writes: ['inbound_events', 'tracking_events', 'shipments'],
  },
  {
    key: 'store_told',
    title: 'Storefront updated',
    short: 'Store told',
    lanes: ['db', 'integration', 'storefront'],
    direction: 'Us → storefront',
    what: 'On the first scan on the road, the AWB and courier go back to the storefront, which is what tells the customer.',
    rule: {
      title: 'Told exactly once',
      text: 'The job has one key per shipment. A retry, or a second scan, finds the job already done and does nothing.',
    },
    calls: ({ source }) => [{ provider: source, endpoint: 'push-tracking', label: 'tracking' }],
    writes: ['outbound_jobs', 'shipments'],
  },
  {
    key: 'closed',
    title: ({ outcome }) => (outcome === 'rto' ? 'Returned to origin' : 'Delivered'),
    short: ({ outcome }) => (outcome === 'rto' ? 'RTO' : 'Delivered'),
    lanes: ({ outcome }) => (outcome === 'rto' ? ['courier', 'integration', 'db', 'wms'] : ['courier', 'integration', 'db']),
    direction: ({ outcome }) => (outcome === 'rto' ? 'Courier → us, WMS → us' : 'Courier → us'),
    what: ({ outcome }) =>
      outcome === 'rto'
        ? 'Delivery failed and the courier brings the box back. The warehouse receives it and puts it away, the unit is on hand again, and the storefront is given the new stock number.'
        : 'Out for delivery, then delivered, and the order closes.',
    rule: ({ outcome }) =>
      outcome === 'rto'
        ? {
            title: 'Stock comes back through the WMS',
            text: 'We never add it back ourselves. Only after the WMS reports the unit on hand do we send the storefront the new number — Shopify per location, WooCommerce one total.',
          }
        : {
            title: 'One set of status words',
            text: 'Each courier has its own words — at Delhivery "Dispatched" means out for delivery. They are translated to ours as they arrive, and the courier\'s own word is kept beside it.',
          },
    calls: ({ courier, wms, source, outcome }) =>
      outcome === 'rto'
        ? [
            { provider: courier, endpoint: 'webhook-tracking', label: 'RTO scans' },
            { provider: wms, endpoint: 'returns', label: 'return received' },
            { provider: wms, endpoint: 'inventory', label: 'stock after put-away' },
            { provider: source, endpoint: 'push-stock', label: 'new stock number' },
          ]
        : [{ provider: courier, endpoint: 'webhook-tracking', label: 'delivered' }],
    writes: ({ outcome }) =>
      outcome === 'rto'
        ? ['inbound_events', 'tracking_events', 'shipments', 'inventory', 'outbound_jobs', 'orders']
        : ['inbound_events', 'tracking_events', 'shipments', 'orders'],
  },
];

// Steps mix plain values and functions of the scenario; this flattens one.
export function describeStep(step, context) {
  const value = (v) => (typeof v === 'function' ? v(context) : v);
  return {
    key: step.key,
    title: value(step.title),
    short: value(step.short),
    lanes: value(step.lanes),
    direction: value(step.direction),
    what: value(step.what),
    rule: value(step.rule),
    calls: step.calls(context),
    writes: value(step.writes),
  };
}

// Which steps use a given endpoint, across every scenario. Used to tag
// endpoints with "step 5" on the provider pages.
export function stepsUsing(providerId, endpointId) {
  const sources = ['shopify', 'woocommerce'];
  const wmses = ['unicommerce', 'easyecom'];
  const couriers = ['delhivery', 'shiprocket'];
  const found = new Set();
  steps.forEach((step, index) => {
    for (const source of sources)
      for (const wms of wmses)
        for (const courier of couriers)
          for (const outcome of ['delivered', 'rto']) {
            const calls = step.calls({ source, wms, courier, outcome });
            if (calls.some((c) => c.provider === providerId && c.endpoint === endpointId)) found.add(index + 1);
          }
  });
  return [...found];
}
