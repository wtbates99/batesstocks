import type { StrategyDefinition, StrategyLeg, StrategyOperator } from '../api/types'

export interface RuleDraft {
  id: string
  metric: string
  condition: StrategyLeg['condition']
  mode: 'metric' | 'value'
  compareToMetric: string
  threshold: string
}

export interface StrategyDraft {
  name: string
  ticker: string
  universeInput: string
  startDate: string
  endDate: string
  initialCapital: string
  positionSizePct: string
  stopLossPct: string
  feeBps: string
  slippageBps: string
  entryOperator: StrategyOperator
  exitOperator: StrategyOperator
  entryRules: RuleDraft[]
  exitRules: RuleDraft[]
}

export interface SavedWorkspaceDraft<T> {
  id: string
  name: string
  createdAt: string
  draft: T
}

export function createRuleDraft(
  metric = 'Close',
  condition: StrategyLeg['condition'] = 'above',
  compareToMetric = 'Ticker_SMA_250',
): RuleDraft {
  return {
    id: crypto.randomUUID(),
    metric,
    condition,
    mode: 'metric',
    compareToMetric,
    threshold: '',
  }
}

export function createDefaultStrategyDraft(): StrategyDraft {
  return {
    name: 'Terminal Trend Stack',
    ticker: 'SPY',
    universeInput: '',
    startDate: '',
    endDate: '',
    initialCapital: '100000',
    positionSizePct: '100',
    stopLossPct: '8',
    feeBps: '2',
    slippageBps: '3',
    entryOperator: 'and',
    exitOperator: 'or',
    entryRules: [
      createRuleDraft('Close', 'above', 'Ticker_SMA_250'),
      createRuleDraft('Ticker_RSI', 'above', 'Ticker_SMA_250'),
    ].map((rule, index) =>
      index === 1
        ? { ...rule, mode: 'value', compareToMetric: 'Ticker_SMA_250', threshold: '55' }
        : rule,
    ),
    exitRules: [
      createRuleDraft('Close', 'below', 'Ticker_SMA_100'),
      { ...createRuleDraft('Ticker_RSI', 'below', 'Ticker_SMA_250'), mode: 'value', threshold: '45' },
    ],
  }
}

function toLeg(rule: RuleDraft): StrategyLeg {
  return {
    metric: rule.metric,
    condition: rule.condition,
    compare_to_metric: rule.mode === 'metric' ? rule.compareToMetric : null,
    threshold: rule.mode === 'value' ? Number(rule.threshold || 0) : null,
  }
}

export function parseUniverse(value: string) {
  const clean = value
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean)
  return clean.length > 0 ? clean : null
}

export function buildStrategyDefinition(draft: StrategyDraft): StrategyDefinition {
  const entryRules = draft.entryRules.map(toLeg)
  const exitRules = draft.exitRules.map(toLeg)

  return {
    name: draft.name.trim() || 'Custom Strategy',
    entry: entryRules[0],
    exit: exitRules[0],
    entry_filters: entryRules.slice(1),
    exit_filters: exitRules.slice(1),
    entry_operator: draft.entryOperator,
    exit_operator: draft.exitOperator,
    universe: parseUniverse(draft.universeInput),
    start_date: draft.startDate || null,
    end_date: draft.endDate || null,
    initial_capital: Number(draft.initialCapital || 100000),
    position_size_pct: Number(draft.positionSizePct || 100),
    stop_loss_pct: draft.stopLossPct ? Number(draft.stopLossPct) : null,
    fee_bps: Number(draft.feeBps || 0),
    slippage_bps: Number(draft.slippageBps || 0),
    max_open_positions: 1,
  }
}
