import { useEffect, useRef } from 'react'
import {
  createChart,
  type IChartApi,
} from 'lightweight-charts'
import type { SecurityBar } from '../../api/types'

interface Props {
  bars: SecurityBar[]
  height?: number
}

export default function TerminalChart({ bars, height = 360 }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const chart = createChart(host, {
      width: host.clientWidth || 900,
      height,
      layout: {
        background: { color: '#0f1214' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#161b22' },
        horzLines: { color: '#161b22' },
      },
      rightPriceScale: {
        borderColor: '#21262d',
      },
      timeScale: {
        borderColor: '#21262d',
        timeVisible: true,
      },
      crosshair: {
        vertLine: { color: '#30363d', labelBackgroundColor: '#141820' },
        horzLine: { color: '#30363d', labelBackgroundColor: '#141820' },
      },
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#3fb950',
      downColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
      borderVisible: false,
    })
    const sma10Series = chart.addLineSeries({
      color: '#f0883e',
      lineWidth: 1,
      priceLineVisible: false,
    })
    const sma30Series = chart.addLineSeries({
      color: '#58a6ff',
      lineWidth: 1,
      priceLineVisible: false,
    })
    const volumeSeries = chart.addHistogramSeries({
      color: '#30363d',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    })

    candleSeries.setData(
      bars.map((bar) => ({
        time: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    )
    sma10Series.setData(
      bars
        .filter((bar) => bar.sma_10 != null)
        .map((bar) => ({ time: bar.date, value: bar.sma_10 as number })),
    )
    sma30Series.setData(
      bars
        .filter((bar) => bar.sma_30 != null)
        .map((bar) => ({ time: bar.date, value: bar.sma_30 as number })),
    )
    volumeSeries.setData(
      bars.map((bar) => ({
        time: bar.date,
        value: bar.volume,
        color: bar.close >= bar.open ? '#2a7a35' : '#b33028',
      })),
    )

    chart.timeScale().fitContent()
    chartRef.current = chart

    const resizeObserver = new ResizeObserver(() => {
      if (hostRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: hostRef.current.clientWidth })
      }
    })
    resizeObserver.observe(host)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [bars, height])

  return <div ref={hostRef} style={{ width: '100%', height }} />
}
