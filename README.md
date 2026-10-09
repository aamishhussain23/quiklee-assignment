# Order integration — storefront, WMS and last mile (prototype)

Homework for Quiklee's full stack round.

The brief: understand the tools an e-commerce order passes through (storefront,
OMS, WMS, last mile, printing), take two of each with public API docs, and say
which APIs I'd call, how I'd fetch the data, how I'd store it in one database
and how I'd keep it updated.

I answered it as a small prototype instead of a document.

**It is a prototype.** Nothing calls a real provider. The data is a small
in-memory database shaped like the PostgreSQL schema I'm proposing, and an order
moves through it in the same steps a real worker would run — so each step can
show which rows it writes.

## Screens

| Screen | What it answers |
| --- | --- |
| Landscape | The five kinds of tool, and what each one owns |
| Integrations | Shopify, WooCommerce, Unicommerce, EasyEcom, Delhivery, Shiprocket — how we connect and which APIs we call |
| Architecture | How they all connect to one database, and who owns which fact |
| Data Model | The tables, with the rows currently in them |
| Order Flow | One order through nine steps: the API call and the rows written at each |

Start with **Simulate an order** on the overview.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

Node 20 or newer.

## How it's put together

```
src/
  data/           what I researched and designed — no logic
    providers.js    the six providers and their APIs
    schema.js       the tables
    flow.js         the nine steps, in words
    landscape.js    the tool types
  lib/
    engine.js       the in-memory database and the nine steps that write to it
    engine.test.js
  store.jsx       the database + the order being walked through
  components/
  pages/          one file per screen
```

`engine.js` is the part worth reading. Every step returns a new copy of the
database, which is what lets the Order Flow page compare "before" and "after"
and list the rows a step wrote. The sample orders aren't typed in — they are
four orders run through the same steps and stopped at different points, so the
tables always agree with each other.

## Where the API details come from

Each provider's public documentation, read on 8 and 9 Oct 2026; links are on
every integration page. Example values are made up, field names are the
documented ones.

Shiprocket's reference site was returning 502 on both days, so its details are
from the API collection that site publishes.
