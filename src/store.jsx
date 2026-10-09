import { createContext, useContext, useMemo, useReducer } from 'react';
import { STEPS, advance, createSim, diffDb, replayWebhook, seedDb } from './lib/engine.js';

// One object holds everything: `db` is the in-memory database, `sim` is the
// order being walked through on the Order Flow page (or null).
function initialState() {
  return { db: seedDb(), sim: null };
}

function step(state) {
  const { db, sim } = state;
  if (!sim || sim.step >= STEPS.length) return state;
  const result = advance(db, sim);
  const entry = { key: result.key, at: result.at, changes: diffDb(db, result.db) };
  return { db: result.db, sim: { ...result.sim, log: [...sim.log, entry], replay: null } };
}

function reducer(state, action) {
  switch (action.type) {
    case 'order/start': {
      let next = { ...state, sim: { ...createSim(state.db, action.scenario, action.now), log: [], replay: null } };
      for (let i = 0; i < action.steps; i += 1) next = step(next);
      return next;
    }
    case 'order/next':
      return step(state);
    case 'order/replay': {
      if (!state.sim) return state;
      const db = replayWebhook(state.db, state.sim, action.now);
      return { db, sim: { ...state.sim, replay: diffDb(state.db, db) } };
    }
    case 'order/clear':
      return { ...state, sim: null };
    case 'reset':
      return initialState();
    default:
      return state;
  }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const actions = useMemo(
    () => ({
      // `steps` lets a link open the flow part-way through.
      startOrder: (scenario, steps = 1) => dispatch({ type: 'order/start', scenario, steps, now: Date.now() }),
      nextStep: () => dispatch({ type: 'order/next' }),
      replayWebhook: () => dispatch({ type: 'order/replay', now: Date.now() }),
      clearOrder: () => dispatch({ type: 'order/clear' }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  );

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}
