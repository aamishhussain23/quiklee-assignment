// The "understanding of the space" half of the brief.

export const toolTypes = [
  {
    id: 'storefront',
    name: 'Storefront / website builder',
    tone: 'purple',
    oneLine: 'Where the customer places the order.',
    owns: 'Catalogue, cart, checkout, payment, the customer.',
    players: 'Shopify, WooCommerce. Marketplaces such as Amazon and Flipkart behave like another storefront.',
  },
  {
    id: 'oms',
    name: 'OMS — order management',
    tone: 'blue',
    oneLine: 'The register of orders. It decides who fulfils, and never touches a box.',
    owns: 'One list of orders across every channel, and which location ships each one.',
    players: 'Unicommerce Uniware (OMS and WMS together), Increff, Vinculum.',
  },
  {
    id: 'wms',
    name: 'WMS — warehouse management',
    tone: 'orange',
    oneLine: 'Everything that happens inside the warehouse.',
    owns: 'Stock per SKU per location, receiving new stock, picking, packing, dispatch, returns.',
    players: 'Unicommerce, EasyEcom, Increff, Vinculum.',
  },
  {
    id: 'tms',
    name: 'TMS / last mile',
    tone: 'teal',
    oneLine: 'The box, from the warehouse to the door.',
    owns: 'Serviceability, the AWB (tracking number), pickup, tracking scans, RTO, COD cash.',
    players: 'Delhivery, Blue Dart, Ecom Express, Shadowfax. Shiprocket is an aggregator over many couriers.',
  },
  {
    id: 'print',
    name: 'Printing',
    tone: 'gray',
    oneLine: 'The paper on the box.',
    owns: 'Shipping label with the AWB barcode, invoice, manifest.',
    players: 'Not a separate product: the WMS or the courier returns the label, and the packing station prints it.',
  },
];
