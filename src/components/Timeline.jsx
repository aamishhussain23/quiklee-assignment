import { formatDateTime } from '../lib/format.js';
import { Empty } from './ui.jsx';

export default function Timeline({ entries, empty = 'Nothing has happened yet.' }) {
  if (!entries.length) return <Empty>{empty}</Empty>;

  return (
    <ol className="timeline">
      {entries.map((entry) => (
        <li key={entry.index} className={entry.tone}>
          <span className="timelineDot" />
          <div>
            <div className="timelineTop">
              <time>{formatDateTime(entry.at)}</time>
              <span className="system">{entry.system}</span>
              <a className="tableTag" href={`#/data-model/${entry.table}`}>
                {entry.table}
              </a>
            </div>
            <b>{entry.title}</b>
            <span>{entry.detail}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
