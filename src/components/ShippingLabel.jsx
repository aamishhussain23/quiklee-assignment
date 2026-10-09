import { rupees } from '../lib/format.js';

// Not a scannable Code 128 — just bars derived from the digits, so each AWB
// looks different. A real label would use a barcode library.
function Barcode({ value }) {
  const bars = [...value].flatMap((char) => {
    const n = Number(char) || 0;
    return [1 + (n % 3), 1 + ((n >> 1) % 2), 1 + (n % 2), 2 - (n % 2)];
  });
  return (
    <div className="barcode" aria-hidden="true">
      {bars.map((width, index) => (
        <span key={index} className={index % 2 ? 'gap' : 'bar'} style={{ width: width * 1.6 }} />
      ))}
    </div>
  );
}

export default function ShippingLabel({ order, shipment, warehouse, items }) {
  const cod = order.payment_mode === 'cod';
  const weight = items.reduce((sum, item) => sum + item.sku.weight_g * item.qty, 0);

  return (
    <div className="shippingLabel">
      <div className="labelTop">
        <b>{shipment.courier_name}</b>
        <span className={cod ? 'pay cod' : 'pay'}>{cod ? `COD ${rupees(order.cod_amount)}` : 'PREPAID'}</span>
      </div>

      <Barcode value={shipment.awb} />
      <div className="labelAwb">{shipment.awb}</div>

      <div className="labelParties">
        <div>
          <small>Ship to</small>
          <b>{order.customer_name}</b>
          <span>
            {order.shipping_city} — {order.shipping_pincode}
          </span>
        </div>
        <div>
          <small>Return to</small>
          <b>{warehouse.name}</b>
          <span>
            {warehouse.city} — {warehouse.pincode}
          </span>
        </div>
      </div>

      <div className="labelFoot">
        <span>Ref {shipment.id}</span>
        <span>{items.map((item) => `${item.sku_id} × ${item.qty}`).join(', ')}</span>
        <span>{weight} g</span>
      </div>
    </div>
  );
}
