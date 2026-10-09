import { useEffect, useState } from 'react';

// Hash routing: #/integrations/shopify?x=1 → segments ['integrations', 'shopify'].
// Enough for a prototype, and it means the deployed site needs no rewrites.
function parse() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, search = ''] = raw.split('?');
  return {
    segments: path.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(search),
  };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);

  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(to) {
  window.location.hash = to;
}
