import { ArrowLeft, ExternalLink } from 'lucide-react';

import { Badge, Card, CodeBlock, Method, PageHeader } from '../components/ui.jsx';
import { stepsUsing } from '../data/flow.js';
import { providerById } from '../data/providers.js';

const directions = { in: 'They call us', pull: 'We read', push: 'We write' };

export default function ApiExplorer({ segments }) {
  const provider = providerById[segments[0]] ?? providerById.shopify;
  const endpoint = provider.endpoints.find((e) => e.id === segments[1]) ?? provider.endpoints[0];
  const used = stepsUsing(provider.id, endpoint.id);

  return (
    <>
      <PageHeader title={provider.name} desc={provider.api}>
        <a className="button" href={`#/integrations/${provider.id}`}>
          <ArrowLeft size={14} /> Back to {provider.name}
        </a>
        <a className="button" href={provider.docs[0].url} target="_blank" rel="noreferrer">
          {provider.docs[0].label} <ExternalLink size={13} />
        </a>
      </PageHeader>

      <Card>
        <div className="endpointTabs">
          {provider.endpoints.map((e) => (
            <a key={e.id} href={`#/api/${provider.id}/${e.id}`} className={e.id === endpoint.id ? 'on' : ''}>
              {e.title}
            </a>
          ))}
        </div>

        <div className="callLine">
          <Method value={endpoint.method} />
          <code>{endpoint.path}</code>
        </div>
        <p className="purpose">
          <Badge>{directions[endpoint.direction]}</Badge>
          {used.map((n) => (
            <a key={n} href="#/flow">
              <Badge tone="blue">order flow · step {n}</Badge>
            </a>
          ))}
          <span>{endpoint.purpose}</span>
        </p>

        <div className="codeGrid">
          <CodeBlock title="Headers" code={endpoint.headers.join('\n')} />
          <CodeBlock title={endpoint.direction === 'in' ? 'What they send' : 'Request body'} code={endpoint.body} />
          <CodeBlock title={endpoint.direction === 'in' ? 'What we reply' : 'Response'} code={endpoint.response} />
        </div>

        <h4 className="subhead">Where the fields go</h4>
        <table className="mapping">
          <tbody>
            {endpoint.mapping.map(([from, to]) => (
              <tr key={from + to}>
                <td>
                  <code>{from}</code>
                </td>
                <td className="mapArrow">→</td>
                <td>
                  <code>{to}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="finePrint">Examples are shortened and the values are made up; field names are the documented ones.</p>
      </Card>
    </>
  );
}
