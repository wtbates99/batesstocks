import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts'
import type { StockData } from '../../api/types'

interface Props {
  data: StockData[]
  height?: number
  showSMA10?: boolean
  showSMA30?: boolean
  showBollinger?: boolean
  showVolume?: boolean
}

const CHART_COLORS = {
  bg:           '#0f1214',
  grid:         '#1a1f26',
  text:         '#8b949e',
  border:       '#21262d',
  upBody:       '#3fb950',
  downBody:     '#f85149',
  upWick:       '#3fb950',
  downWick:     '#f85149',
  sma10:        '#58a6ff',
  sma30:        '#f0883e',
  bbHigh:       '#39d0d8',
  bbLow:        '#39d0d8',
  bbMid:        '#484f58',
  volume:       '#22272e',
  volumeUp:     '#2a7a35',
  volumeDown:   '#b33028',
}

type Overlay = 'sma10' | 'sma30' | 'ema10' | 'ema30' | 'bb'
type SubChart = 'rsi' | 'macd' | 'volume'

const OVERLAY_OPTS: { key: Overlay; label: string }[] = [
  { key: 'sma10', label: 'SMA10' },
  { key: 'sma30', label: 'SMA30' },
  { key: 'ema10', label: 'EMA10' },
  { key: 'ema30', label: 'EMA30' },
  { key: 'bb',    label: 'BB' },
]

const SUBCHART_OPTS: { key: SubChart; label: string }[] = [
  { key: 'volume', label: 'VOL' },
  { key: 'rsi',    label: 'RSI' },
  { key: 'macd',   label: 'MACD' },
]

export default function CandleChart({ data, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const subChartRef = useRef<IChartApi | null>(null)
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(['sma10', 'sma30']))
  const [subChart, setSubChart] = useState<SubChart>('volume')
  const [days, setDays] = useState(180)
  const subContainerRef = useRef<HTMLDivElement>(null)

  const toggleOverlay = (k: Overlay) =>
    setOverlays(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })

  // Slice data to requested days
  const sliced = data.slice(-days)

  useEffect(() => {
    if (!containerRef.current || sliced.length === 0) return

    // Destroy previous
    chartRef.current?.remove()

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.bg },
        textColor: CHART_COLORS.text,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid, style: LineStyle.Dotted },
        horzLines: { color: CHART_COLORS.grid, style: LineStyle.Dotted },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: CHART_COLORS.border, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: CHART_COLORS.border, timeVisible: true, secondsVisible: false },
    })
    chartRef.current = chart

    // Candlestick
    const candle = chart.addCandlestickSeries({
      upColor: CHART_COLORS.upBody,
      downColor: CHART_COLORS.downBody,
      wickUpColor: CHART_COLORS.upWick,
      wickDownColor: CHART_COLORS.downWick,
      borderVisible: false,
    })
    candleRef.current = candle

    const candleData: CandlestickData[] = sliced
      .filter(d => d.Ticker_Open != null && d.Ticker_Close != null)
      .map(d => ({
        time: d.Date.slice(0, 10) as unknown as CandlestickData['time'],
        open: d.Ticker_Open,
        high: d.Ticker_High,
        low: d.Ticker_Low,
        close: d.Ticker_Close,
      }))
    candle.setData(candleData)

    // Overlays
    const addLine = (color: string, values: Array<number | null>) => {
      const series = chart.addLineSeries({
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      const lineData: LineData[] = sliced
        .map((d, i) => ({ time: d.Date.slice(0, 10) as unknown as LineData['time'], value: values[i] as number }))
        .filter(p => p.value != null)
      series.setData(lineData)
      return series
    }

    if (overlays.has('sma10'))
      addLine(CHART_COLORS.sma10, sliced.map(d => d.Ticker_SMA_10 ?? null))
    if (overlays.has('sma30'))
      addLine(CHART_COLORS.sma30, sliced.map(d => d.Ticker_SMA_30 ?? null))
    if (overlays.has('ema10'))
      addLine('#d29922', sliced.map(d => d.Ticker_EMA_10 ?? null))
    if (overlays.has('ema30'))
      addLine('#a371f7', sliced.map(d => d.Ticker_EMA_30 ?? null))
    if (overlays.has('bb')) {
      addLine(CHART_COLORS.bbHigh, sliced.map(d => d.Ticker_Bollinger_High ?? null))
      addLine(CHART_COLORS.bbLow,  sliced.map(d => d.Ticker_Bollinger_Low ?? null))
      addLine(CHART_COLORS.bbMid,  sliced.map(d => d.Ticker_Bollinger_Mid ?? null))
    }

    chart.timeScale().fitContent()

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, height)
      }
    })
    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliced.length, overlays, days, height])

  // Sub-chart
  useEffect(() => {
    if (!subContainerRef.current || sliced.length === 0) return
    subChartRef.current?.remove()

    const subH = 100
    const chart = createChart(subContainerRef.current, {
      width: subContainerRef.current.clientWidth,
      height: subH,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.bg },
        textColor: CHART_COLORS.text,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid, style: LineStyle.Dotted },
        horzLines: { color: CHART_COLORS.grid, style: LineStyle.Dotted },
      },
      rightPriceScale: { borderColor: CHART_COLORS.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: CHART_COLORS.border, timeVisible: false, visible: false },
    })
    subChartRef.current = chart

    if (subChart === 'volume') {
      const vol = chart.addHistogramSeries({
        color: CHART_COLORS.volume,
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      })
      vol.setData(sliced.map(d => ({
        time: d.Date.slice(0, 10) as unknown as LineData['time'],
        value: d.Ticker_Volume,
        color: d.Ticker_Close >= d.Ticker_Open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown,
      })))
    } else if (subChart === 'rsi') {
      const line = chart.addLineSeries({ color: '#a371f7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      line.setData(sliced
        .filter(d => d.Ticker_RSI != null)
        .map(d => ({ time: d.Date.slice(0, 10) as unknown as LineData['time'], value: d.Ticker_RSI! })))
    } else if (subChart === 'macd') {
      const macdLine = chart.addLineSeries({ color: '#58a6ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      const sigLine  = chart.addLineSeries({ color: '#f0883e', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      macdLine.setData(sliced.filter(d => d.Ticker_MACD != null).map(d => ({ time: d.Date.slice(0, 10) as unknown as LineData['time'], value: d.Ticker_MACD! })))
      sigLine.setData(sliced.filter(d => d.Ticker_MACD_Signal != null).map(d => ({ time: d.Date.slice(0, 10) as unknown as LineData['time'], value: d.Ticker_MACD_Signal! })))
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (subContainerRef.current) chart.resize(subContainerRef.current.clientWidth, subH)
    })
    if (subContainerRef.current) ro.observe(subContainerRef.current)
    return () => { ro.disconnect(); chart.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliced.length, subChart, days])

  return (
    <div className="chart-container" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 6px', alignItems: 'center', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {/* Days selector */}
        {[60, 180, 365, 730].map(d => (
          <button
            key={d}
            className={`term-btn${days === d ? ' primary' : ''}`}
            style={{ padding: '2px 6px', fontSize: 'var(--text-xs)' }}
            onClick={() => setDays(d)}
          >
            {d === 730 ? '2Y' : d === 365 ? '1Y' : d === 180 ? '6M' : '3M'}
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px' }} />
        {OVERLAY_OPTS.map(o => (
          <button
            key={o.key}
            className={`term-btn${overlays.has(o.key) ? ' primary' : ''}`}
            style={{ padding: '2px 6px', fontSize: 'var(--text-xs)' }}
            onClick={() => toggleOverlay(o.key)}
          >
            {o.label}
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px' }} />
        {SUBCHART_OPTS.map(o => (
          <button
            key={o.key}
            className={`term-btn${subChart === o.key ? ' primary' : ''}`}
            style={{ padding: '2px 6px', fontSize: 'var(--text-xs)' }}
            onClick={() => setSubChart(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div ref={containerRef} />
      <div ref={subContainerRef} />
    </div>
  )
}
