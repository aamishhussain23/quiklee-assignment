import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink } from 'lucide-react';

import { Badge, Card, CardHead, CategoryBadge, Method, PageHeader, ProviderMark } from '../components/ui.jsx';
import { stepsUsing } from '../data/flow.js';
import { categories, providerById, providersIn } from '../data/providers.js';

const directions = { in: 'They call us', pull: 'We read', push: 'We write' };

function ProviderCard({ provider }) {
  return (
    <a className="card providerCard" href={`#/integrations/${provider.id}`}>
      <div className="providerTop">
        <ProviderMark provider={provider} />
        <CategoryBadge category={provider.category} />
      </div>
      <h3>{provider.name}</h3>
      <p>{provider.role}</p>
      <div className="cardFoot">
        {provider.endpoints.length} APIs <ChevronRight size={15} />
      </div>
    </a>
  );
}

function ProviderDetail({ provider }) {
  return (
    <>
      <PageHeader title={provider.name} desc={provider.role}>
        <a className="button" href="#/integrations">
          <ArrowLeft size={14} /> All integrations
        </a>
        {provider.docs.map((doc) => (
          <a className="button" key={doc.url} href={doc.url} target="_blank" rel="noreferrer">
            {doc.label} <ExternalLink size={13} />
          </a>
        ))}
      </PageHeader>

      <Card>
        <CardHead title="How we connect" />
        <dl className="facts">
          <dt>API</dt>
          <dd>
            {provider.api}
            <code className="block">{provider.baseUrl}</code>
          </dd>
          <dt>Auth</dt>
          <dd>
            {provider.auth.summary}
            <code className="block">{provider.auth.header}</code>
          </dd>
          <dt>They tell us</dt>
          <dd>{provider.receive}</dd>
          <dt>We ask</dt>
          <dd>{provider.poll}</dd>
          {provider.limits && (
            <>
              <dt>Rate limits</dt>
              <dd>{provider.limits}</dd>
            </>
          )}
          {provider.printing && (
            <>
              <dt>Label</dt>
              <dd>{provider.printing}</dd>
            </>
          )}
        </dl>
      </Card>

      <Card>
        <CardHead title="APIs the integration calls" desc="Open one for the request, the response and where each field is stored." />
        <div className="tableWrap">
          <table className="endpointTable">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Call</th>
                <th>What for</th>
                <th>Order flow</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {provider.endpoints.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td className="nowrap">{directions[endpoint.direction]}</td>
                  <td>
                    <div className="callCell">
                      <Method value={endpoint.method} />
                      <code>{endpoint.path}</code>
                    </div>
                    <span className="tableSub">{endpoint.title}</span>
                  </td>
                  <td>{endpoint.purpose}</td>
                  <td className="nowrap">
                    {stepsUsing(provider.id, endpoint.id).map((n) => (
                      <Badge key={n} tone="blue">
                        step {n}
                      </Badge>
                    ))}
                  </td>
                  <td>
                    <a className="button" href={`#/api/${provider.id}/${endpoint.id}`}>
                      Open <ArrowRight size={13} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export default function Integrations({ segments }) {
  const provider = providerById[segments[0]];
  if (provider) return <ProviderDetail provider={provider} />;

  return (
    <>
      <PageHeader
        title="Integrations"
        desc="Details are from each provider's public API documentation."
      />
      {Object.entries(categories).map(([id, category]) => (
        <section className="providerGroup" key={id}>
          <h2>{category.plural}</h2>
          <div className="providerGrid">
            {providersIn(id).map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
