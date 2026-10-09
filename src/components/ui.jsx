import { categories } from '../data/providers.js';
import { words } from '../lib/format.js';

export function Badge({ tone = 'gray', title, children }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Card({ className = '', children }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHead({ title, desc, children }) {
  return (
    <div className="cardHead">
      <div>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function PageHeader({ title, desc, children }) {
  return (
    <div className="pageHeader">
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="pageActions">{children}</div>}
    </div>
  );
}

export function Callout({ icon: Icon, title, tone = 'blue', children }) {
  return (
    <div className={`callout ${tone}`}>
      {Icon && <Icon size={17} />}
      <div>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}

export function Method({ value }) {
  return <span className={`method ${value.toLowerCase()}`}>{value === 'HOOK' ? 'WEBHOOK' : value}</span>;
}

export function CodeBlock({ title, code }) {
  if (!code) return null;
  return (
    <div className="codeBox">
      <div className="codeTitle">{title}</div>
      <pre>{code}</pre>
    </div>
  );
}

export function ProviderMark({ provider, size = '' }) {
  const tone = categories[provider.category].tone;
  return <span className={`mark ${tone} ${size}`}>{provider.name[0]}</span>;
}

export function CategoryBadge({ category }) {
  const { label, tone } = categories[category];
  return <Badge tone={tone}>{label}</Badge>;
}

const tones = {
  new: 'gray',
  allocated: 'blue',
  packed: 'blue',
  shipped: 'blue',
  delivered: 'green',
  rto: 'red',
};

export function StatusBadge({ value }) {
  return <Badge tone={tones[value] ?? 'gray'}>{value === 'rto' ? 'RTO' : words(value)}</Badge>;
}

export function Segmented({ label, value, options, onChange, disabled = false }) {
  return (
    <div className="segmented">
      <span className="segmentedLabel">{label}</span>
      <div className="segmentedOptions" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            className={option.value === value ? 'on' : ''}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}
