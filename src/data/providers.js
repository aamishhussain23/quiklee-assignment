// Reference data for the six providers in scope.
//
// Everything here comes from each provider's public documentation, read on
// 8 and 9 Oct 2026. Example bodies and responses use documented field names
// with made-up values, and are trimmed to the fields the integration uses.

export const categories = {
  storefront: { label: 'Storefront', plural: 'Storefronts', tone: 'purple' },
  wms: { label: 'WMS', plural: 'Warehouse management', tone: 'orange' },
  courier: { label: 'Last mile', plural: 'Last mile', tone: 'teal' },
};

const shopify = {
  id: 'shopify',
  name: 'Shopify',
  category: 'storefront',
  role: 'Order source for brands on Shopify. Tracking and stock are pushed back.',
  api: 'GraphQL Admin API',
  baseUrl: 'https://{shop}.myshopify.com/admin/api/2026-10/graphql.json',
  docs: [
    { label: 'GraphQL Admin API', url: 'https://shopify.dev/docs/api/admin-graphql' },
    { label: 'Webhooks', url: 'https://shopify.dev/docs/apps/build/webhooks' },
  ],
  auth: {
    summary: 'OAuth access token',
    header: 'X-Shopify-Access-Token: <token>',
    detail:
      'Offline tokens outlive the user session, which a background sync needs. Scopes: read_orders, write_merchant_managed_fulfillment_orders, write_inventory, read_products, read_locations.',
  },
  receive: 'Webhooks: orders/create, orders/updated, orders/cancelled',
  poll: 'orders query, every 5 min',
  limits: 'By query cost: 100 points per second on a standard plan',
  endpoints: [
    {
      id: 'webhook-order',
      title: 'Order webhooks',
      direction: 'in',
      method: 'HOOK',
      path: 'orders/create · orders/updated · orders/cancelled',
      purpose: 'Shopify calls our endpoint when an order is created or changes.',
      headers: [
        'X-Shopify-Topic: orders/create',
        'X-Shopify-Hmac-SHA256: <base64 HMAC-SHA256 of the raw body>',
        'X-Shopify-Webhook-Id: <id of this delivery>',
      ],
      body: `{
  "id": 5521873001,
  "name": "#4521",
  "financial_status": "pending",
  "shipping_address": { "name": "Riya S.", "city": "Hyderabad", "zip": "500081" },
  "line_items": [{ "sku": "GLOW-CRM-50", "quantity": 1, "price": "999.00" }]
}`,
      response: '200 OK',
      mapping: [
        ['id', 'orders.external_order_id'],
        ['name', 'orders.external_order_number'],
        ['line_items[].sku', 'order_items.sku_id'],
        ['X-Shopify-Webhook-Id', 'inbound_events.vendor_event_id'],
      ],
    },
    {
      id: 'pull-orders',
      title: 'orders query',
      direction: 'pull',
      method: 'POST',
      path: '/admin/api/2026-10/graphql.json',
      purpose: 'Ask for orders that changed since we last asked, in case a webhook was missed.',
      headers: ['X-Shopify-Access-Token: <token>', 'Content-Type: application/json'],
      body: `query Orders($cursor: String) {
  orders(first: 100, after: $cursor,
         query: "updated_at:>2026-10-08T10:00:00Z fulfillment_status:unfulfilled") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt updatedAt
      displayFinancialStatus displayFulfillmentStatus
      shippingAddress { name city zip }
      lineItems(first: 50) { nodes { sku quantity variant { id } } }
      fulfillmentOrders(first: 5) { nodes { id } }
    }
  }
}`,
      response: `{
  "data": { "orders": {
    "pageInfo": { "hasNextPage": false, "endCursor": "eyJsYXN0X2lkIjo1NTIxODczMDAxfQ" },
    "nodes": [{
      "id": "gid://shopify/Order/5521873001",
      "name": "#4521",
      "updatedAt": "2026-10-08T10:31:04Z",
      "displayFinancialStatus": "PENDING",
      "displayFulfillmentStatus": "UNFULFILLED",
      "lineItems": { "nodes": [{ "sku": "GLOW-CRM-50", "quantity": 1 }] },
      "fulfillmentOrders": { "nodes": [{ "id": "gid://shopify/FulfillmentOrder/7712" }] }
    }]
  } },
  "extensions": { "cost": { "actualQueryCost": 14, "throttleStatus": { "restoreRate": 100 } } }
}`,
      mapping: [
        ['id', 'orders.external_order_id'],
        ['name', 'orders.external_order_number'],
        ['updatedAt', 'sync_cursors.cursor (the newest one seen)'],
        ['lineItems.sku', 'order_items.sku_id'],
        ['fulfillmentOrders.id', 'order_items.external_line_id'],
      ],
    },
    {
      id: 'push-tracking',
      title: 'fulfillmentCreate',
      direction: 'push',
      method: 'POST',
      path: '/admin/api/2026-10/graphql.json',
      purpose: 'Tell the store the order has shipped, with the AWB. Shopify emails the customer.',
      headers: ['X-Shopify-Access-Token: <token>', 'Content-Type: application/json'],
      body: `mutation {
  fulfillmentCreate(fulfillment: {
    lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: "gid://shopify/FulfillmentOrder/7712" }]
    trackingInfo: { number: "1490810000037", company: "Delhivery" }
    notifyCustomer: true
  }) {
    fulfillment { id status }
    userErrors { field message }
  }
}`,
      response: `{ "data": { "fulfillmentCreate": {
  "fulfillment": { "id": "gid://shopify/Fulfillment/4410", "status": "SUCCESS" },
  "userErrors": []
} } }`,
      mapping: [
        ['shipments.awb', 'trackingInfo.number'],
        ['shipments.courier_name', 'trackingInfo.company'],
        ['order_items.external_line_id', 'fulfillmentOrderId'],
      ],
    },
    {
      id: 'push-stock',
      title: 'inventorySetQuantities',
      direction: 'push',
      method: 'POST',
      path: '/admin/api/2026-10/graphql.json',
      purpose: 'Set the sellable quantity for one SKU at one location.',
      headers: ['X-Shopify-Access-Token: <token>', 'Content-Type: application/json'],
      body: `mutation {
  inventorySetQuantities(input: {
    name: "available"
    reason: "correction"
    quantities: [{
      inventoryItemId: "gid://shopify/InventoryItem/9911"
      locationId: "gid://shopify/Location/301"
      quantity: 39
      changeFromQuantity: 40
    }]
  }) @idempotent(key: "<our job id>") {
    userErrors { field message }
  }
}`,
      response: `{ "data": { "inventorySetQuantities": { "userErrors": [] } } }`,
      mapping: [
        ['inventory.on_hand − reserved', 'quantity'],
        ['the number we sent last time', 'changeFromQuantity'],
        ['skus.store_item_id', 'inventoryItemId'],
        ['the Shopify location of that warehouse', 'locationId'],
      ],
    },
  ],
};

const woocommerce = {
  id: 'woocommerce',
  name: 'WooCommerce',
  category: 'storefront',
  role: 'Order source for brands on WordPress. Tracking and stock are pushed back.',
  api: 'REST API',
  baseUrl: 'https://{store}/wp-json/wc/v3',
  docs: [
    { label: 'REST API reference', url: 'https://woocommerce.github.io/woocommerce-rest-api-docs/' },
    { label: 'Webhooks', url: 'https://woocommerce.com/document/webhooks/' },
  ],
  auth: {
    summary: 'Consumer key and secret',
    header: 'Authorization: Basic base64(ck_…:cs_…)',
    detail: 'HTTP Basic over HTTPS. Keys are created under WooCommerce › Settings › Advanced › REST API with read/write access.',
  },
  receive: 'Webhooks: order.created, order.updated',
  poll: 'GET /orders?modified_after=…, every 5 min',
  endpoints: [
    {
      id: 'webhook-order',
      title: 'Order webhooks',
      direction: 'in',
      method: 'HOOK',
      path: 'order.created · order.updated',
      purpose: 'The store calls our endpoint when an order is created or changes.',
      headers: [
        'X-WC-Webhook-Topic: order.created',
        'X-WC-Webhook-Signature: <base64 HMAC-SHA256 of the raw body>',
        'X-WC-Webhook-Delivery-ID: <unique per delivery>',
      ],
      body: `{
  "id": 9812,
  "status": "processing",
  "payment_method": "razorpay",
  "total": "449.00",
  "shipping": { "first_name": "Karthik", "city": "Bengaluru", "postcode": "560034" },
  "line_items": [{ "product_id": 310, "variation_id": 0, "sku": "BREW-BEAN-250", "quantity": 1 }]
}`,
      response: 'Any 2xx',
      mapping: [
        ['id', 'orders.external_order_id'],
        ['status', 'orders.status (processing → new, cancelled → cancelled)'],
        ['line_items[].sku', 'order_items.sku_id'],
        ['X-WC-Webhook-Delivery-ID', 'inbound_events.vendor_event_id'],
      ],
    },
    {
      id: 'pull-orders',
      title: 'List orders',
      direction: 'pull',
      method: 'GET',
      path: '/wp-json/wc/v3/orders?modified_after=2026-10-08T10:00:00&dates_are_gmt=true&status=processing&per_page=100&page=1',
      purpose: 'Ask for orders that changed since we last asked, in case a webhook was missed.',
      headers: ['Authorization: Basic base64(ck_…:cs_…)'],
      body: null,
      response: `[{
  "id": 9812,
  "status": "processing",
  "date_modified_gmt": "2026-10-08T10:42:11",
  "payment_method": "razorpay",
  "total": "449.00",
  "shipping": { "first_name": "Karthik", "city": "Bengaluru", "postcode": "560034" },
  "line_items": [{ "product_id": 310, "variation_id": 0, "sku": "BREW-BEAN-250", "quantity": 1 }]
}]`,
      mapping: [
        ['id', 'orders.external_order_id'],
        ['date_modified_gmt', 'sync_cursors.cursor (the newest one seen)'],
        ['line_items[].sku', 'order_items.sku_id'],
      ],
    },
    {
      id: 'push-tracking',
      title: 'Update order',
      direction: 'push',
      method: 'PUT',
      path: '/wp-json/wc/v3/orders/9812',
      purpose: 'Mark the order shipped and attach the AWB.',
      headers: ['Authorization: Basic base64(ck_…:cs_…)', 'Content-Type: application/json'],
      body: `{
  "status": "completed",
  "meta_data": [
    { "key": "_tracking_number", "value": "2871000000074" },
    { "key": "_tracking_provider", "value": "Ecom Express" }
  ]
}`,
      response: 'The updated order object.',
      mapping: [
        ['shipments.awb', 'meta_data._tracking_number'],
        ['shipments.courier_name', 'meta_data._tracking_provider'],
      ],
    },
    {
      id: 'push-stock',
      title: 'Update stock',
      direction: 'push',
      method: 'PUT',
      path: '/wp-json/wc/v3/products/310',
      purpose: 'Set the stock for one product.',
      headers: ['Authorization: Basic base64(ck_…:cs_…)', 'Content-Type: application/json'],
      body: `{ "manage_stock": true, "stock_quantity": 41 }`,
      response: 'The updated product object.',
      mapping: [['Σ (on_hand − reserved) across locations', 'stock_quantity']],
    },
  ],
};

const unicommerce = {
  id: 'unicommerce',
  name: 'Unicommerce',
  category: 'wms',
  role: 'Uniware — warehouse and order management. Owns stock and the pick-pack-dispatch floor.',
  api: 'Uniware REST API',
  baseUrl: 'https://{tenant}.unicommerce.com',
  docs: [{ label: 'Uniware API documentation', url: 'https://documentation.unicommerce.com/docs/using-the-document.html' }],
  auth: {
    summary: 'OAuth2 access token',
    header: 'Authorization: bearer <token>  ·  Facility: <facilityCode>',
    detail:
      'GET /oauth/token?grant_type=password&client_id=my-trusted-client&username=…&password=… returns an access and a refresh token. Warehouse-level calls also need the Facility header.',
  },
  receive: 'Notifications: packed, ready to ship, dispatched, delivered, returns, GRN',
  poll: 'shippingPackage/search and inventorySnapshot/get',
  printing: 'Label and invoice as PDF (shipment/show, invoice/show)',
  endpoints: [
    {
      id: 'create-order',
      title: 'Create sale order',
      direction: 'push',
      method: 'POST',
      path: '/services/rest/v1/oms/saleOrder/create',
      purpose: 'Create the order in the warehouse so it can be picked.',
      headers: ['Authorization: bearer <token>', 'Facility: HYDDS01', 'Content-Type: application/json'],
      body: `{
  "saleOrder": {
    "code": "ORD-10021",
    "channel": "CUSTOM",
    "cashOnDelivery": true,
    "saleOrderItems": [
      { "code": "ORD-10021-1", "itemSku": "GLOW-CRM-50", "shippingMethodCode": "STD", "sellingPrice": 999 }
    ],
    "addresses": [{ "name": "Riya S.", "city": "Hyderabad", "pincode": "500081" }]
  }
}`,
      response: `{ "saleOrderDetailDTO": { "code": "ORD-10021", "status": "CREATED" } }`,
      mapping: [
        ['orders.id', 'saleOrder.code'],
        ['order_items.sku_id', 'saleOrderItems[].itemSku'],
        ['orders.payment_mode = cod', 'cashOnDelivery'],
      ],
    },
    {
      id: 'notify-status',
      title: 'Shipment notifications',
      direction: 'in',
      method: 'HOOK',
      path: 'POST {our base url}/dispatchedShipment',
      purpose: 'Uniware pushes shipment and return events to URLs we give them.',
      headers: ['Content-Type: application/json'],
      body: `{
  "shippingPackageCode": "SP-88213",
  "AWB": "1490810000037",
  "courierName": "Delhivery",
  "invoiceNo": "INV-2026-10-4410",
  "facilityCode": "HYDDS01"
}`,
      response: 'Any 2xx',
      mapping: [
        ['shippingPackageCode', 'shipments.wms_package_code'],
        ['facilityCode', 'shipments.warehouse_id (through warehouses.wms_code)'],
      ],
    },
    {
      id: 'poll-status',
      title: 'Search shipping packages',
      direction: 'pull',
      method: 'POST',
      path: '/services/rest/v1/oms/shippingPackage/search',
      purpose: 'Ask for the package of an order we are still waiting on, in case a notification was missed.',
      headers: ['Authorization: bearer <token>', 'Facility: HYDDS01'],
      body: `{ "saleOrderCode": "ORD-10021" }`,
      response: `{
  "totalRecords": 1,
  "elements": [{ "code": "SP-88213", "saleOrderCode": "ORD-10021", "status": "PACKED" }]
}`,
      mapping: [
        ['code', 'shipments.wms_package_code'],
        ['saleOrderCode', 'shipments.order_id'],
        ['status', 'shipments.status (PACKED → packed, DISPATCHED → picked_up)'],
      ],
    },
    {
      id: 'inventory',
      title: 'Inventory snapshot',
      direction: 'pull',
      method: 'POST',
      path: '/services/rest/v1/inventory/inventorySnapshot/get',
      purpose: 'Stock per SKU at one warehouse. Only the SKUs that changed.',
      headers: ['Authorization: bearer <token>', 'Facility: HYDDS01'],
      body: `{ "updatedSinceInMinutes": 30 }`,
      response: `{
  "inventorySnapshots": [{
    "itemTypeSKU": "GLOW-CRM-50",
    "inventory": 39,
    "openSale": 1,
    "openPurchase": 0,
    "putawayPending": 0,
    "inventoryBlocked": 0
  }]
}`,
      mapping: [
        ['itemTypeSKU', 'inventory.sku_id'],
        ['Facility header', 'inventory.warehouse_id'],
        ['inventory', 'inventory.on_hand'],
      ],
    },
    {
      id: 'returns',
      title: 'Search returns',
      direction: 'pull',
      method: 'POST',
      path: '/services/rest/v1/oms/return/search',
      purpose: 'Returns received at the warehouse — customer returns (CIR) and courier returns (RTO).',
      headers: ['Authorization: bearer <token>', 'Facility: HYDDS01'],
      body: `{ "returnType": "RTO", "statusCode": "RECEIVED" }`,
      response: null,
      mapping: [['returned items', 'inventory.on_hand (after putaway, through the next snapshot)']],
    },
  ],
};

const easyecom = {
  id: 'easyecom',
  name: 'EasyEcom',
  category: 'wms',
  role: 'Warehouse and inventory management. Owns stock and the pick-pack-dispatch floor.',
  api: 'EasyEcom API',
  baseUrl: 'https://api.easyecom.io',
  docs: [{ label: 'API documentation', url: 'https://api-docs.easyecom.io/' }],
  auth: {
    summary: 'API key plus a token, one per location',
    header: 'x-api-key: <key>  ·  Authorization: Bearer <jwt>',
    detail:
      'POST /access/token with the x-api-key header and { email, password, location_key }. Every call needs both headers. location_key is the warehouse, so there is one token per warehouse.',
  },
  receive: 'Webhooks: confirm order, ready to dispatch, manifested, cancel, mark return, update inventory, order tracking',
  poll: 'getAllOrders?updated_after=… and getInventoryDetailsV3',
  printing: 'Label and invoice as PDF links (orders/documentsV2)',
  endpoints: [
    {
      id: 'create-order',
      title: 'Create order',
      direction: 'push',
      method: 'POST',
      path: '/webhook/v2/createOrder',
      purpose: 'Create the order in the warehouse so it can be picked.',
      headers: ['x-api-key: <key>', 'Authorization: Bearer <jwt>', 'Content-Type: application/json'],
      body: `{
  "orderType": "retailorder",
  "orderNumber": "ORD-10022",
  "paymentMode": 5,
  "items": [{ "Sku": "BREW-BEAN-250", "Quantity": 1, "Price": 449 }]
}`,
      response: `{ "code": 200, "data": { "OrderID": "88412", "InvoiceID": "771204", "SuborderID": "99310" } }`,
      mapping: [
        ['orders.id', 'orderNumber'],
        ['order_items.sku_id', 'items[].Sku'],
        ['InvoiceID', 'shipments.wms_package_code'],
      ],
    },
    {
      id: 'notify-status',
      title: 'Order webhooks',
      direction: 'in',
      method: 'HOOK',
      path: 'Ready to dispatch · Manifested · Order tracking',
      purpose: 'EasyEcom posts order and tracking changes to a URL we configure per location.',
      headers: ['Content-Type: application/json'],
      body: `{
  "orderStatus": "Ready to dispatch",
  "awbNumber": "2871000000074",
  "currentShippingStatus": "Pickup Scheduled"
}`,
      response: 'Any 2xx',
      mapping: [
        ['orderStatus', 'shipments.status'],
        ['awbNumber', 'shipments.awb'],
      ],
    },
    {
      id: 'poll-status',
      title: 'List orders',
      direction: 'pull',
      method: 'GET',
      path: '/orders/V2/getAllOrders?updated_after=2026-10-08 10:00:00&updated_before=2026-10-08 10:10:00',
      purpose: 'Poll for orders that changed.',
      headers: ['x-api-key: <key>', 'Authorization: Bearer <jwt>'],
      body: null,
      response: `{
  "data": {
    "orders": [{
      "invoice_id": 771204,
      "reference_code": "ORD-10022",
      "order_status": "Ready to dispatch",
      "shipping_status": "Shipment Created",
      "awb_number": "2871000000074",
      "courier": "Ecom Express"
    }],
    "nextUrl": null
  }
}`,
      mapping: [
        ['invoice_id', 'shipments.wms_package_code'],
        ['order_status', 'shipments.status'],
        ['awb_number', 'shipments.awb'],
        ['courier', 'shipments.courier_name'],
      ],
    },
    {
      id: 'inventory',
      title: 'Inventory details',
      direction: 'pull',
      method: 'GET',
      path: '/getInventoryDetailsV3?includeLocations=1&limit=50',
      purpose: 'Stock per SKU per location, in one call.',
      headers: ['x-api-key: <key>', 'Authorization: Bearer <jwt>'],
      body: null,
      response: `{
  "inventoryData": [{
    "sku": "BREW-BEAN-250",
    "location_key": "blr-ds-01",
    "availableInventory": 30,
    "virtual_inventory_count": 0
  }]
}`,
      mapping: [
        ['sku', 'inventory.sku_id'],
        ['location_key', 'inventory.warehouse_id (through warehouses.wms_code)'],
        ['availableInventory', 'inventory.on_hand'],
      ],
    },
    {
      id: 'returns',
      title: 'Returns',
      direction: 'pull',
      method: 'GET',
      path: '/orders/getAllReturns?reference_code=ORD-10024',
      purpose: 'Returns recorded at the warehouse.',
      headers: ['x-api-key: <key>', 'Authorization: Bearer <jwt>'],
      body: null,
      response: null,
      mapping: [['returned items', 'inventory.on_hand, through the next inventory read']],
    },
  ],
};

const delhivery = {
  id: 'delhivery',
  name: 'Delhivery',
  category: 'courier',
  role: 'Courier. Owns the AWB, pickup, every scan, RTO and COD remittance.',
  api: 'Express B2C API',
  baseUrl: 'https://track.delhivery.com',
  docs: [
    { label: 'Express API reference', url: 'https://delhivery-express-api-doc.readme.io/' },
    { label: 'Token generation', url: 'https://help.delhivery.com/docs/api-token-generation' },
  ],
  auth: {
    summary: 'Static API token',
    header: 'Authorization: Token <api-token>',
    detail: 'Issued in Delhivery One under Settings › API Setup. There is no token endpoint and nothing to refresh.',
  },
  receive: 'Scan push: every scan',
  poll: 'GET /api/v1/packages/json/ for open AWBs, every 15 min',
  limits: 'Tracking: 750 requests per 5 minutes',
  printing: 'Label data as JSON; we draw the label ourselves',
  endpoints: [
    {
      id: 'serviceability',
      title: 'Pincode serviceability',
      direction: 'pull',
      method: 'GET',
      path: '/c/api/pin-codes/json/?filter_codes=500081',
      purpose: 'Can this pincode be delivered to, and is COD allowed there?',
      headers: ['Authorization: Token <api-token>'],
      body: null,
      response: `{
  "delivery_codes": [{
    "postal_code": {
      "pin": 500081, "cod": "Y", "pre_paid": "Y", "pickup": "Y",
      "is_oda": "N", "max_amount": 50000, "sort_code": "HYD/MDP"
    }
  }]
}`,
      mapping: [['cod / pre_paid', 'decides whether this courier can take the shipment']],
    },
    {
      id: 'create-shipment',
      title: 'Create shipment',
      direction: 'push',
      method: 'POST',
      path: '/api/cmu/create.json',
      purpose: 'Book the shipment. The response carries the waybill (AWB).',
      headers: ['Authorization: Token <api-token>', 'Content-Type: application/x-www-form-urlencoded'],
      body: `format=json&data={
  "pickup_location": { "name": "QUIKLEE-HYD-DS-01" },
  "shipments": [{
    "order": "SHP-20031",
    "name": "Riya S.", "add": "Madhapur", "pin": "500081", "phone": "98XXXXXX10",
    "payment_mode": "COD", "cod_amount": "999", "total_amount": "999",
    "weight": "180", "products_desc": "Face Cream 50 g",
    "hsn_code": "3304", "seller_gst_tin": "36XXXXX0000X1ZX",
    "shipping_mode": "Surface"
  }]
}`,
      response: `{
  "success": true,
  "packages": [{
    "status": "Success",
    "waybill": "1490810000037",
    "refnum": "SHP-20031",
    "sort_code": "HYD/MDP",
    "payment": "COD",
    "cod_amount": 999
  }]
}`,
      mapping: [
        ['shipments.id', 'shipments[].order'],
        ['orders.payment_mode / cod_amount', 'payment_mode / cod_amount'],
        ['packages[].waybill', 'shipments.awb'],
      ],
    },
    {
      id: 'label',
      title: 'Packing slip',
      direction: 'pull',
      method: 'GET',
      path: '/api/p/packing_slip?wbns=1490810000037',
      purpose: 'Everything needed to print the label.',
      headers: ['Authorization: Token <api-token>'],
      body: null,
      response: `{ "packages_found": 1, "packages": [{ "wbn": "1490810000037", "sort_code": "HYD/MDP", "cod": 999 }] }`,
      mapping: [['packages[]', 'label rendered by us, link in shipments.label_url']],
    },
    {
      id: 'pickup',
      title: 'Pickup request',
      direction: 'push',
      method: 'POST',
      path: '/fm/request/new/',
      purpose: 'Ask for a pickup at a warehouse for a date and time.',
      headers: ['Authorization: Token <api-token>', 'Content-Type: application/json'],
      body: `{
  "pickup_location": "QUIKLEE-HYD-DS-01",
  "pickup_date": "2026-10-08",
  "pickup_time": "16:00:00",
  "expected_package_count": 40
}`,
      response: `{ "pickup_id": 7731204 }`,
      mapping: [['pickup_id', 'outbound_jobs.note']],
    },
    {
      id: 'webhook-tracking',
      title: 'Scan push',
      direction: 'in',
      method: 'HOOK',
      path: 'POST {our webhook url}',
      purpose: 'Delhivery posts each scan as it happens.',
      headers: ['<custom auth header agreed with Delhivery>'],
      body: `{
  "Shipment": {
    "AWB": "1490810000037",
    "ReferenceNo": "SHP-20031",
    "Status": {
      "Status": "In Transit",
      "StatusType": "UD",
      "StatusDateTime": "2026-10-08T13:31:00",
      "StatusLocation": "Hyderabad_Gachibowli_H"
    }
  }
}`,
      response: '200 "Success"',
      mapping: [
        ['AWB', 'tracking_events.shipment_id (through shipments.awb)'],
        ['Status.Status / StatusType', 'tracking_events.vendor_status / vendor_status_code'],
        ['Status.StatusDateTime', 'tracking_events.occurred_at'],
      ],
    },
    {
      id: 'track',
      title: 'Track by waybill',
      direction: 'pull',
      method: 'GET',
      path: '/api/v1/packages/json/?waybill=1490810000037,1490810000074',
      purpose: 'Poll open shipments for scans the push missed.',
      headers: ['Authorization: Token <api-token>'],
      body: null,
      response: `{
  "ShipmentData": [{
    "Shipment": {
      "AWB": "1490810000037",
      "ReferenceNo": "SHP-20031",
      "Status": { "Status": "Delivered", "StatusType": "DL", "StatusDateTime": "2026-10-09T12:40:00" },
      "Scans": []
    }
  }]
}`,
      mapping: [['Shipment.Status', 'tracking_events (one row per new scan)']],
    },
  ],
};

const shiprocket = {
  id: 'shiprocket',
  name: 'Shiprocket',
  category: 'courier',
  role: 'Courier aggregator. One API in front of many couriers; it picks one and returns the AWB.',
  api: 'Shiprocket API v2',
  baseUrl: 'https://apiv2.shiprocket.in/v1/external',
  docs: [
    { label: 'API reference', url: 'https://apidocs.shiprocket.in/' },
    { label: 'API helpsheet', url: 'https://support.shiprocket.in/support/solutions/articles/43000337456' },
  ],
  auth: {
    summary: 'Login as an API user, token valid 10 days',
    header: 'Authorization: Bearer <token>',
    detail: 'POST /auth/login with the email and password of an API user (created under Settings › API). The token lasts 240 hours.',
  },
  receive: 'Tracking webhook',
  poll: 'GET /courier/track/awb/{awb} for open AWBs, every 15 min',
  printing: 'Label, invoice and manifest as PDF links',
  endpoints: [
    {
      id: 'serviceability',
      title: 'Courier serviceability',
      direction: 'pull',
      method: 'GET',
      path: '/courier/serviceability/?pickup_postcode=560034&delivery_postcode=560095&weight=0.3&cod=0',
      purpose: 'Which couriers can take this shipment, at what rate and ETA.',
      headers: ['Authorization: Bearer <token>'],
      body: null,
      response: `{
  "data": {
    "available_courier_companies": [
      { "courier_company_id": 54, "courier_name": "Ecom Express", "rate": 48.5, "etd": "Oct 10, 2026" }
    ]
  }
}`,
      mapping: [['courier_company_id', 'passed to assign AWB']],
    },
    {
      id: 'create-shipment',
      title: 'Create order',
      direction: 'push',
      method: 'POST',
      path: '/orders/create/adhoc',
      purpose: 'Register the shipment with Shiprocket.',
      headers: ['Authorization: Bearer <token>', 'Content-Type: application/json'],
      body: `{
  "order_id": "SHP-20032",
  "order_date": "2026-10-08 10:42",
  "pickup_location": "blr-koramangala",
  "billing_customer_name": "Karthik", "billing_city": "Bengaluru", "billing_pincode": "560034",
  "shipping_is_billing": true,
  "order_items": [{ "name": "Roasted Beans 250 g", "sku": "BREW-BEAN-250", "units": 1, "selling_price": 449, "hsn": "0901" }],
  "payment_method": "Prepaid",
  "sub_total": 449,
  "length": 14, "breadth": 9, "height": 6, "weight": 0.28
}`,
      response: `{ "order_id": 310045771, "shipment_id": 309412208 }`,
      mapping: [
        ['shipments.id', 'order_id'],
        ['shipment_id', 'kept for assign AWB, label and pickup'],
      ],
    },
    {
      id: 'assign-awb',
      title: 'Assign AWB',
      direction: 'push',
      method: 'POST',
      path: '/courier/assign/awb',
      purpose: 'Pick the courier (or let Shiprocket pick) and get the AWB.',
      headers: ['Authorization: Bearer <token>', 'Content-Type: application/json'],
      body: `{ "shipment_id": 309412208, "courier_id": 54 }`,
      response: `{ "response": { "data": { "awb_code": "2871000000074", "courier_name": "Ecom Express" } } }`,
      mapping: [
        ['awb_code', 'shipments.awb'],
        ['courier_name', 'shipments.courier_name'],
      ],
    },
    {
      id: 'label',
      title: 'Generate label',
      direction: 'push',
      method: 'POST',
      path: '/courier/generate/label',
      purpose: 'A PDF label for one or more shipments.',
      headers: ['Authorization: Bearer <token>', 'Content-Type: application/json'],
      body: `{ "shipment_id": [309412208] }`,
      response: `{ "label_url": "https://…/label.pdf" }`,
      mapping: [['label_url', 'shipments.label_url']],
    },
    {
      id: 'pickup',
      title: 'Request pickup',
      direction: 'push',
      method: 'POST',
      path: '/courier/generate/pickup',
      purpose: 'Schedule the courier to collect.',
      headers: ['Authorization: Bearer <token>', 'Content-Type: application/json'],
      body: `{ "shipment_id": [309412208], "pickup_date": ["2026-10-08"] }`,
      response: null,
      mapping: [['—', 'shipments.status = manifested']],
    },
    {
      id: 'webhook-tracking',
      title: 'Tracking webhook',
      direction: 'in',
      method: 'HOOK',
      path: 'POST {our webhook url}',
      purpose: 'Shiprocket posts status changes for every courier behind it, in one format.',
      headers: ['x-api-key: <token set in the Shiprocket panel>'],
      body: `{
  "awb": "2871000000074",
  "current_status": "IN TRANSIT",
  "shipment_status": "IN TRANSIT",
  "shipment_status_id": 18
}`,
      response: '200 OK',
      mapping: [
        ['awb', 'tracking_events.shipment_id (through shipments.awb)'],
        ['current_status', 'tracking_events.vendor_status'],
        ['shipment_status_id', 'tracking_events.vendor_status_code'],
      ],
    },
    {
      id: 'track',
      title: 'Track by AWB',
      direction: 'pull',
      method: 'GET',
      path: '/courier/track/awb/2871000000074',
      purpose: 'Poll open shipments for changes the webhook missed.',
      headers: ['Authorization: Bearer <token>'],
      body: null,
      response: `{
  "tracking_data": {
    "shipment_track": [{ "current_status": "In Transit" }],
    "shipment_track_activities": [
      { "date": "2026-10-08 13:44:00", "activity": "In Transit", "location": "Bengaluru Hub" }
    ]
  }
}`,
      mapping: [['shipment_track_activities[]', 'tracking_events (one row per new activity)']],
    },
  ],
};

export const providers = [shopify, woocommerce, unicommerce, easyecom, delhivery, shiprocket];

export const providerById = Object.fromEntries(providers.map((p) => [p.id, p]));

export function findEndpoint(providerId, endpointId) {
  return providerById[providerId]?.endpoints.find((e) => e.id === endpointId) ?? null;
}

export function providersIn(category) {
  return providers.filter((p) => p.category === category);
}
