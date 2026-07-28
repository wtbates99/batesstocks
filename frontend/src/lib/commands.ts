import type { NavigateFunction } from 'react-router-dom'
import type { UseMutationResult } from '@tanstack/react-query'
import type { SyncRequest, SyncResponse } from '../api/types'

export type TerminalCommand =
  | { kind: 'security'; ticker: string; functionCode: 'DES' }
  | { kind: 'security'; ticker: string; functionCode: 'NEWS' }
  | { kind: 'route'; route: '/screener' | '/backtest' | '/' | '/monitor' | '/watchlists' | '/compare' | '/news' }
  | { kind: 'sync'; tickers: string[] }
  | { kind: 'ai'; prompt: string }
  | { kind: 'watchlist'; action: 'add' | 'remove' | 'show'; ticker?: string }
  | { kind: 'compare'; tickers: string[] }
  | { kind: 'history' }
  | { kind: 'help' }
  | { kind: 'invalid'; reason: string }

function isTickerToken(token: string) {
  return /^[A-Z.^-]{1,10}$/.test(token)
}

export function parseTerminalCommand(raw: string): TerminalCommand {
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  if (!normalized) return { kind: 'invalid', reason: 'Enter a symbol or terminal command.' }

  const tokens = normalized.split(' ')
  if (tokens[0] === 'MON' || tokens[0] === 'MONITOR') return { kind: 'route', route: '/monitor' }
  if (tokens[0] === 'WL' && tokens.length === 1) return { kind: 'route', route: '/watchlists' }
  if (tokens[0] === 'WATCHLIST' || tokens[0] === 'WATCHLISTS') return { kind: 'route', route: '/watchlists' }
  if (tokens[0] === 'NEWS' && tokens.length === 1) return { kind: 'route', route: '/news' }
  if (tokens[0] === 'EQS' || tokens[0] === 'SCREEN') return { kind: 'route', route: '/screener' }
  if (tokens[0] === 'PORT' || tokens[0] === 'BT' || tokens[0] === 'BKT') return { kind: 'route', route: '/backtest' }
  if (tokens[0] === 'HOME' || tokens[0] === 'DASH') return { kind: 'route', route: '/' }
  if (tokens[0] === 'LAST') return { kind: 'history' }
  if (tokens[0] === 'HELP' || tokens[0] === '?') return { kind: 'help' }

  if (tokens[0] === 'SYNC') {
    const tickers = tokens.slice(1).filter(isTickerToken)
    return { kind: 'sync', tickers }
  }

  if (tokens[0] === 'WL' || tokens[0] === 'WATCH') {
    if (tokens.length === 1) return { kind: 'watchlist', action: 'show' }
    if ((tokens[1] === 'ADD' || tokens[1] === '+') && tokens[2] && isTickerToken(tokens[2])) {
      return { kind: 'watchlist', action: 'add', ticker: tokens[2] }
    }
    if ((tokens[1] === 'RM' || tokens[1] === 'DEL' || tokens[1] === '-') && tokens[2] && isTickerToken(tokens[2])) {
      return { kind: 'watchlist', action: 'remove', ticker: tokens[2] }
    }
  }

  if (tokens[0] === 'COMP' || tokens[0] === 'COMPARE') {
    const tickers = tokens.slice(1).filter(isTickerToken)
    if (tickers.length === 0) return { kind: 'route', route: '/compare' }
    if (tickers.length >= 1) return { kind: 'compare', tickers }
    return { kind: 'invalid', reason: 'Use COMP [TICKER] [BENCHMARK...] to set compare mode.' }
  }

  if (tokens[0] === 'AI') {
    const prompt = raw.trim().slice(2).trim()
    return prompt
      ? { kind: 'ai', prompt }
      : { kind: 'invalid', reason: 'Use AI followed by a prompt.' }
  }

  if (tokens[0] === 'NEWS' && tokens[1] && isTickerToken(tokens[1])) {
    return { kind: 'security', ticker: tokens[1], functionCode: 'NEWS' }
  }

  if (tokens.length === 1 && isTickerToken(tokens[0])) {
    return { kind: 'security', ticker: tokens[0], functionCode: 'DES' }
  }

  if (tokens.length === 2 && isTickerToken(tokens[0]) && tokens[1] === 'DES') {
    return { kind: 'security', ticker: tokens[0], functionCode: 'DES' }
  }

  if (tokens.length === 2 && tokens[0] === 'DES' && isTickerToken(tokens[1])) {
    return { kind: 'security', ticker: tokens[1], functionCode: 'DES' }
  }

  return { kind: 'invalid', reason: 'Commands: MON, WL, COMP, NEWS, [TICKER] DES, EQS, PORT, SYNC, LAST, AI.' }
}

interface ExecuteCommandOptions {
  command: TerminalCommand
  navigate: NavigateFunction
  syncMutation: UseMutationResult<SyncResponse, Error, SyncRequest, unknown>
  openAi: (prompt?: string) => void
  onNotice: (message: string, tone?: 'neutral' | 'positive' | 'negative') => void
  getPreviousTicker: () => string | undefined
  onWatchlist: (action: 'add' | 'remove' | 'show', ticker?: string) => void
  onCompare: (tickers: string[]) => void
}

export async function executeTerminalCommand({
  command,
  navigate,
  syncMutation,
  openAi,
  onNotice,
  getPreviousTicker,
  onWatchlist,
  onCompare,
}: ExecuteCommandOptions) {
  if (command.kind === 'invalid') {
    onNotice(command.reason, 'negative')
    return false
  }

  if (command.kind === 'help') {
    onNotice('MON WL COMP NEWS DES EQS PORT SYNC LAST AI', 'neutral')
    return true
  }

  if (command.kind === 'history') {
    const previous = getPreviousTicker()
    if (!previous) {
      onNotice('No prior ticker in session memory.', 'negative')
      return false
    }
    navigate(`/security/${previous}`)
    onNotice(`${previous} DES`)
    return true
  }

  if (command.kind === 'watchlist') {
    onWatchlist(command.action, command.ticker)
    return true
  }

  if (command.kind === 'compare') {
    onCompare(command.tickers)
    navigate(`/security/${command.tickers[0]}`)
    onNotice(`COMPARE ${command.tickers.join(' / ')}`, 'positive')
    return true
  }

  if (command.kind === 'route') {
    navigate(command.route)
    onNotice(`OPEN ${command.route === '/' ? 'DASH' : command.route.slice(1).toUpperCase()}`)
    return true
  }

  if (command.kind === 'security') {
    navigate(`/security/${command.ticker}`)
    onNotice(`${command.ticker} ${command.functionCode}`)
    return true
  }

  if (command.kind === 'ai') {
    openAi(command.prompt)
    onNotice('AI PANEL READY')
    return true
  }

  const payload = {
    years: 5,
    tickers: command.tickers.length > 0 ? command.tickers : undefined,
  }
  const result = await syncMutation.mutateAsync(payload)
  onNotice(
    `SYNC ${result.tickers.length > 0 ? result.tickers.join(', ') : 'UNIVERSE'} ${result.rows_written.toLocaleString()} ROWS`,
    'positive',
  )
  return true
}
