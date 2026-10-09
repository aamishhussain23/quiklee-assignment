import { ArrowRight, Check, Pause, Play, Plus, Repeat, RotateCcw, ShieldCheck, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import RowChanges from '../components/RowChanges.jsx';
import ShippingLabel from '../components/ShippingLabel.jsx';
import Timeline from '../components/Timeline.jsx';
import { Badge, Callout, Card, CardHead, Method, PageHeader, Segmented, StatusBadge } from '../components/ui.jsx';
import { describeStep, lanes, steps } from '../data/flow.js';
import { findEndpoint, providerById } from '../data/providers.js';
import { STORES, orderTimeline, orderView } from '../lib/engine.js';
import { formatDateTime } from '../lib/format.js';
import { useStore } from '../store.jsx';

const options = {
  source: [
    { value: 'shopify', label: 'Shopify' },
    { value: 'woocommerce', label: 'WooCommerce' },
  ],
  city: [
    { value: 'Hyderabad', label: 'Hyderabad' },
    { value: 'Bengaluru', label: 'Bengaluru' },
  ],
  courier: [
    { value: 'delhivery', label: 'Delhivery' },
    { value: 'shiprocket', label: 'Shiprocket' },
  ],
  outcome: [
    { value: 'delivered', label: 'Delivered' },
    { value: 'rto', label: 'RTO' },
  ],
};

// A link can open the page on a given scenario and step:
// #/flow?store=woocommerce&city=Bengaluru&courier=shiprocket&end=rto&step=5
function scenarioFrom(query) {
  const pick = (param, key) => {
    const value = query.get(param);
    return options[key].some((o) => o.value === value) ? value : options[key][0].value;
  };
  return { source: pick('store', 'source'), city: pick('city', 'city'), courier: pick('courier', 'courier'), outcome: pick('end', 'outcome') };
}

function Preview({ described }) {
  return (
    <Card>
      <CardHead title="The nine steps" desc="Place the order to walk through them one at a time." />
      <ol className="previewList">
        {described.map((step, index) => (
          <li key={step.key}>
            <span className="stepNo">{index + 1}</span>
            <div>
              <b>{step.title}</b>
              <span>{step.direction}</span>
            </div>
            <div className="tableChips">
              {step.writes.map((table) => (
                <code key={table}>{table}</code>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// Endpoint paths in the provider data carry example ids. On this page they are
// swapped for the ids of the order being walked through.
function fillPath(path, { order, shipment }) {
  let filled = path;
  if (order) {
    filled = filled
      .replace(/filter_codes=\d+/, `filter_codes=${order.shipping_pincode}`)
      .replace(/delivery_postcode=\d+/, `delivery_postcode=${order.shipping_pincode}`)
      .replace(/reference_code=ORD-\d+/, `reference_code=${order.id}`)
      .replace(/orders\/9812$/, `orders/${order.external_order_number}`);
  }
  if (shipment) {
    filled = filled.replace(/shippingPackageCodes=[\w-]+/, `shippingPackageCodes=${shipment.wms_package_code}`);
    if (shipment.awb) filled = filled.replace(/(1490810000037|2871000000074)(,\d+)?/, shipment.awb);
  }
  return filled;
}

function StepPanel({ index, step, entry, laneNames, warehouse, order, shipment, items, replay, onReplay }) {
  return (
    <Card className="stepPanel">
      <div className="stepHead">
        <span className="stepBig">{index + 1}</span>
        <div>
          <h2>{step.title}</h2>
          <p>
            {step.direction} · {formatDateTime(entry.at)} <span className="muted">on the simulated clock</span>
          </p>
        </div>
      </div>

      <div className="lanes">
        {lanes.map((lane) => (
          <div key={lane.id} className={step.lanes.includes(lane.id) ? 'lane on' : 'lane'}>
            <small>{lane.id === 'wms' ? `WMS · ${warehouse.id}` : lane.label}</small>
            <b>{laneNames[lane.id]}</b>
          </div>
        ))}
      </div>

      <p className="stepWhat">{step.what}</p>

      <h4 className="subhead">Provider calls</h4>
      <div className="calls">
        {step.calls.map((call) => {
          const endpoint = findEndpoint(call.provider, call.endpoint);
          return (
            <a className="call" key={`${call.provider}/${call.endpoint}/${call.label}`} href={`#/api/${call.provider}/${call.endpoint}`}>
              <Method value={endpoint.method} />
              <code>{fillPath(endpoint.path, { order, shipment })}</code>
              <span>
                {providerById[call.provider].name} · {call.label}
              </span>
              <ArrowRight size={13} />
            </a>
          );
        })}
      </div>

      <h4 className="subhead">
        Rows written <small>the difference in the database before and after this step</small>
      </h4>
      <RowChanges changes={entry.changes} />

      {step.key === 'awb' && shipment?.awb && (
        <>
          <h4 className="subhead">
            The label <small>what the packing station prints and sticks on the box</small>
          </h4>
          <ShippingLabel order={order} shipment={shipment} warehouse={warehouse} items={items} />
          <p className="finePrint">
            {shipment.courier === 'delhivery'
              ? 'Delhivery returns the label as data, not a PDF, so a label like this is drawn on our side.'
              : 'Shiprocket returns a link to a PDF. This is a preview of what is on it.'}
          </p>
        </>
      )}

      {index <= 1 && (
        <div className="replay">
          <button className="button" onClick={onReplay}>
            <Repeat size={14} /> Deliver the same webhook again
          </button>
          {replay && (
            <div className="replayResult">
              <p>The duplicate is noted and answered. No order row is touched:</p>
              <RowChanges changes={replay} />
            </div>
          )}
        </div>
      )}

      <Callout icon={ShieldCheck} title={step.rule.title}>
        {step.rule.text}
      </Callout>
    </Card>
  );
}

function OrderSoFar({ db, sim, order, shipment }) {
  if (!sim) {
    return (
      <Card>
        <CardHead title="The order" />
        <p className="cardNote">
          Nothing placed yet. This panel fills in as each system gives the order its own id — the storefront first, then
          us, then the warehouse, then the courier.
        </p>
      </Card>
    );
  }

  const dash = <span className="muted">—</span>;
  return (
    <Card>
      <CardHead title="The order so far" />
      <dl className="idList">
        <dt>Storefront</dt>
        <dd>
          <code>{sim.external_order_number}</code>
        </dd>
        <dt>Ours</dt>
        <dd>{order ? <code>{order.id}</code> : <span className="muted">not saved yet</span>}</dd>
        <dt>Location</dt>
        <dd>{order?.warehouse_id ? <code>{order.warehouse_id}</code> : dash}</dd>
        <dt>WMS package</dt>
        <dd>{shipment ? <code>{shipment.wms_package_code}</code> : dash}</dd>
        <dt>AWB</dt>
        <dd>{shipment?.awb ? <code>{shipment.awb}</code> : dash}</dd>
        <dt>Status</dt>
        <dd>{order ? <StatusBadge value={order.status} /> : <Badge tone="blue">event saved</Badge>}</dd>
      </dl>
      <Timeline entries={order ? orderTimeline(db, order.id) : []} empty="Only the saved event exists. There is no order row until the next step." />
    </Card>
  );
}

export default function OrderFlow({ query }) {
  const { db, sim, startOrder, nextStep, replayWebhook, clearOrder, reset } = useStore();
  const [draft, setDraft] = useState(() => scenarioFrom(query));
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState(null);
  const opened = useRef(false);

  // Honour ?step= and ?autoplay= once, when the page is opened.
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const step = Number(query.get('step'));
    if (step > 0) {
      startOrder(draft, Math.min(step, steps.length));
    } else if (query.get('autoplay')) {
      startOrder(draft);
      setPlaying(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return undefined;
    if (!sim || sim.step >= steps.length) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(nextStep, 1700);
    return () => clearTimeout(timer);
  }, [playing, sim, nextStep]);

  const scenario = sim?.scenario ?? draft;
  const order = sim?.order_id ? db.orders.find((o) => o.id === sim.order_id) : null;
  const shipment = sim?.shipment_id ? db.shipments.find((s) => s.id === sim.shipment_id) : null;
  // Before allocation this is a prediction: the dark store in the customer's city.
  const warehouse =
    db.warehouses.find((w) => w.id === order?.warehouse_id) ??
    db.warehouses.find((w) => w.city === scenario.city && w.type === 'dark_store');

  const context = { source: scenario.source, wms: warehouse.wms, courier: scenario.courier, outcome: scenario.outcome };
  const items = order ? orderView(db, order.id).items : [];
  const described = steps.map((step) => describeStep(step, context));
  const done = sim?.step ?? 0;
  const finished = done >= steps.length;
  const viewing = sim ? Math.min(picked ?? done - 1, done - 1) : -1;

  const laneNames = {
    storefront: providerById[scenario.source].name,
    integration: 'Translate, send',
    db: 'Our tables',
    wms: providerById[context.wms].name,
    courier: providerById[scenario.courier].name,
  };

  const choose = (key) => (value) => setDraft({ ...draft, [key]: value });
  const stop = () => {
    setPlaying(false);
    setPicked(null);
  };

  return (
    <>
      <PageHeader
        title="Order flow"
        desc="One order, nine steps. Each step shows the provider call behind it and the rows it writes to our database."
      >
        <button
          className="button"
          onClick={() => {
            stop();
            reset();
          }}
        >
          <RotateCcw size={14} /> Reset data
        </button>
      </PageHeader>

      <Card className="scenario">
        <div className="scenarioPickers">
          <Segmented label="Storefront" value={scenario.source} options={options.source} onChange={choose('source')} disabled={Boolean(sim)} />
          <Segmented label="Customer in" value={scenario.city} options={options.city} onChange={choose('city')} disabled={Boolean(sim)} />
          <Segmented label="Courier" value={scenario.courier} options={options.courier} onChange={choose('courier')} disabled={Boolean(sim)} />
          <Segmented label="Ends as" value={scenario.outcome} options={options.outcome} onChange={choose('outcome')} disabled={Boolean(sim)} />
        </div>

        <div className="scenarioFoot">
          <p>
            A <b>{STORES[scenario.source].brand}</b> order on {laneNames.storefront}, fulfilled from <b>{warehouse.id}</b> (
            {providerById[context.wms].name}), shipped by {laneNames.courier},{' '}
            {scenario.outcome === 'rto' ? 'and returned to origin' : 'and delivered'}.
          </p>
          <div className="pageActions">
            {!sim && (
              <>
                <button className="button primary" onClick={() => startOrder(draft)}>
                  <Play size={15} /> Place the order
                </button>
                <button
                  className="button"
                  onClick={() => {
                    startOrder(draft);
                    setPlaying(true);
                  }}
                >
                  Play all nine
                </button>
              </>
            )}
            {sim && !finished && (
              <>
                <button
                  className="button primary"
                  onClick={() => {
                    setPicked(null);
                    nextStep();
                  }}
                >
                  <SkipForward size={15} /> Next step
                </button>
                <button className="button" onClick={() => setPlaying(!playing)}>
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                  {playing ? 'Pause' : 'Play the rest'}
                </button>
              </>
            )}
            {sim && (
              <button
                className="button"
                onClick={() => {
                  stop();
                  clearOrder();
                }}
              >
                <Plus size={14} /> New order
              </button>
            )}
          </div>
        </div>
      </Card>

      <ol className="stepper">
        {described.map((step, index) => {
          const state = index === viewing ? 'viewing' : index < done ? 'done' : 'todo';
          return (
            <li key={step.key}>
              <button className={state} disabled={index >= done} onClick={() => setPicked(index)}>
                <span className="stepNo">{index < done && index !== viewing ? <Check size={13} /> : index + 1}</span>
                {step.short}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flowGrid">
        {viewing < 0 ? (
          <Preview described={described} />
        ) : (
          <StepPanel
            index={viewing}
            step={described[viewing]}
            entry={sim.log[viewing]}
            laneNames={laneNames}
            warehouse={warehouse}
            order={order}
            shipment={shipment}
            items={items}
            replay={sim.replay}
            onReplay={replayWebhook}
          />
        )}
        <OrderSoFar db={db} sim={sim} order={order} shipment={shipment} />
      </div>
    </>
  );
}
