const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatDateTime = (iso) => (iso ? dateTime.format(new Date(iso)) : '—');

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '—';
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 0) return formatDateTime(iso);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export const rupees = (amount) => `₹${Number(amount).toLocaleString('en-IN')}`;

export const words = (value) => String(value ?? '').replace(/_/g, ' ');

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// A cell value as it should read in a table of rows.
export function cell(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' && ISO.test(value)) return formatDateTime(value);
  return String(value);
}
