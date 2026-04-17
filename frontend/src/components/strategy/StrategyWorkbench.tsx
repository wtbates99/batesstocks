import { Plus, X } from 'lucide-react'
import type { StrategyOperator } from '../../api/types'
import { STRATEGY_CONDITIONS, STRATEGY_METRICS } from '../../features/strategies/config'
import type { RuleDraft, StrategyDraft } from '../../lib/strategy'

interface Props {
  draft: StrategyDraft
  onChange: (updater: (draft: StrategyDraft) => StrategyDraft) => void
  includeTicker: boolean
}

function conditionLabel(condition: RuleDraft['condition']) {
  switch (condition) {
    case 'crosses_above':
      return 'Crosses Above'
    case 'crosses_below':
      return 'Crosses Below'
    case 'above':
      return 'Above'
    case 'below':
      return 'Below'
    default:
      return condition
  }
}

function updateRule(
  rules: RuleDraft[],
  id: string,
  updater: (rule: RuleDraft) => RuleDraft,
) {
  return rules.map((rule) => (rule.id === id ? updater(rule) : rule))
}

function MetricOptions() {
  const categories = ['price', 'trend', 'momentum', 'volume'] as const
  return (
    <>
      {categories.map((category) => (
        <optgroup key={category} label={category.toUpperCase()}>
          {STRATEGY_METRICS.filter((metric) => metric.category === category).map((metric) => (
            <option key={metric.value} value={metric.value}>{metric.label}</option>
          ))}
        </optgroup>
      ))}
    </>
  )
}

function RuleStack({
  title,
  operator,
  rules,
  onOperatorChange,
  onRulesChange,
}: {
  title: string
  operator: StrategyOperator
  rules: RuleDraft[]
  onOperatorChange: (value: StrategyOperator) => void
  onRulesChange: (next: RuleDraft[]) => void
}) {
  return (
    <section className="stack-section">
      <div className="stack-header">
        <div className="stack-title">{title}</div>
        <div className="stack-controls">
          <label className="stack-operator">
            <span>JOIN</span>
            <select
              className="terminal-select"
              value={operator}
              onChange={(event) => onOperatorChange(event.target.value as StrategyOperator)}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
            </select>
          </label>
          <button
            type="button"
            className="terminal-button"
            onClick={() => onRulesChange([
              ...rules,
              {
                id: crypto.randomUUID(),
                metric: 'Close',
                condition: 'above',
                mode: 'metric',
                compareToMetric: 'Ticker_SMA_250',
                threshold: '',
              },
            ])}
          >
            <Plus size={12} />
            RULE
          </button>
        </div>
      </div>

      <div className="rule-list">
        {rules.map((rule, index) => (
          <div key={rule.id} className="rule-row">
            <div className="rule-index">{index + 1}</div>
            <select
              className="terminal-select"
              value={rule.metric}
              onChange={(event) => onRulesChange(updateRule(rules, rule.id, (current) => ({
                ...current,
                metric: event.target.value,
              })))}
            >
              <MetricOptions />
            </select>
            <select
              className="terminal-select"
              value={rule.condition}
              onChange={(event) => onRulesChange(updateRule(rules, rule.id, (current) => ({
                ...current,
                condition: event.target.value as RuleDraft['condition'],
              })))}
            >
              {STRATEGY_CONDITIONS.map((condition) => (
                <option key={condition} value={condition}>{conditionLabel(condition)}</option>
              ))}
            </select>
            <select
              className="terminal-select"
              value={rule.mode}
              onChange={(event) => onRulesChange(updateRule(rules, rule.id, (current) => ({
                ...current,
                mode: event.target.value as RuleDraft['mode'],
              })))}
            >
              <option value="metric">METRIC</option>
              <option value="value">VALUE</option>
            </select>
            {rule.mode === 'metric' ? (
              <select
                className="terminal-select"
                value={rule.compareToMetric}
                onChange={(event) => onRulesChange(updateRule(rules, rule.id, (current) => ({
                  ...current,
                  compareToMetric: event.target.value,
                })))}
              >
                <MetricOptions />
              </select>
            ) : (
              <input
                className="terminal-input"
                value={rule.threshold}
                onChange={(event) => onRulesChange(updateRule(rules, rule.id, (current) => ({
                  ...current,
                  threshold: event.target.value,
                })))}
                inputMode="decimal"
              />
            )}
            <button
              type="button"
              className="terminal-icon-button"
              disabled={rules.length === 1}
              onClick={() => onRulesChange(rules.filter((current) => current.id !== rule.id))}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function StrategyWorkbench({ draft, onChange, includeTicker }: Props) {
  return (
    <div className="strategy-workbench">
      <div className="form-grid">
        {includeTicker && (
          <label className="field">
            <span className="field-label">Ticker</span>
            <input
              className="terminal-input"
              placeholder="TICKER"
              value={draft.ticker}
              onChange={(event) => onChange((current) => ({
                ...current,
                ticker: event.target.value.toUpperCase(),
              }))}
            />
          </label>
        )}
        <label className="field field-wide">
          <span className="field-label">Strategy Name</span>
          <input
            className="terminal-input"
            value={draft.name}
            onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label className="field field-wide">
          <span className="field-label">Universe Override</span>
          <input
            className="terminal-input"
            value={draft.universeInput}
            onChange={(event) => onChange((current) => ({ ...current, universeInput: event.target.value }))}
            placeholder="AAPL,MSFT,NVDA"
          />
        </label>
        <label className="field">
          <span className="field-label">Start</span>
          <input
            className="terminal-input"
            type="date"
            value={draft.startDate}
            onChange={(event) => onChange((current) => ({ ...current, startDate: event.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field-label">End</span>
          <input
            className="terminal-input"
            type="date"
            value={draft.endDate}
            onChange={(event) => onChange((current) => ({ ...current, endDate: event.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field-label">Capital</span>
          <input
            className="terminal-input"
            value={draft.initialCapital}
            onChange={(event) => onChange((current) => ({ ...current, initialCapital: event.target.value }))}
            inputMode="decimal"
          />
        </label>
        <label className="field">
          <span className="field-label">Position %</span>
          <input
            className="terminal-input"
            value={draft.positionSizePct}
            onChange={(event) => onChange((current) => ({ ...current, positionSizePct: event.target.value }))}
            inputMode="decimal"
          />
        </label>
        <label className="field">
          <span className="field-label">Stop %</span>
          <input
            className="terminal-input"
            value={draft.stopLossPct}
            onChange={(event) => onChange((current) => ({ ...current, stopLossPct: event.target.value }))}
            inputMode="decimal"
          />
        </label>
        <label className="field">
          <span className="field-label">Fee Bps</span>
          <input
            className="terminal-input"
            value={draft.feeBps}
            onChange={(event) => onChange((current) => ({ ...current, feeBps: event.target.value }))}
            inputMode="decimal"
          />
        </label>
        <label className="field">
          <span className="field-label">Slippage Bps</span>
          <input
            className="terminal-input"
            value={draft.slippageBps}
            onChange={(event) => onChange((current) => ({ ...current, slippageBps: event.target.value }))}
            inputMode="decimal"
          />
        </label>
      </div>

      <RuleStack
        title="Entry Stack"
        operator={draft.entryOperator}
        rules={draft.entryRules}
        onOperatorChange={(entryOperator) => onChange((current) => ({ ...current, entryOperator }))}
        onRulesChange={(entryRules) => onChange((current) => ({ ...current, entryRules }))}
      />

      <RuleStack
        title="Exit Stack"
        operator={draft.exitOperator}
        rules={draft.exitRules}
        onOperatorChange={(exitOperator) => onChange((current) => ({ ...current, exitOperator }))}
        onRulesChange={(exitRules) => onChange((current) => ({ ...current, exitRules }))}
      />
    </div>
  )
}
