import { useEffect, useRef } from 'react'
import { ColorType, createChart, type IChartApi } from 'lightweight-charts'
import type { IntradayBar, SecurityBar } from '../../api/types'

interface DailyProps {
  bars: SecurityBar[]
  intradayBars?: never
  height?: number
  overlays?: Array<'sma_10' | 'sma_30' | 'sma_200' | 'ema_10'>
}

interface IntradayProps {
  bars?: never
  intradayBars: IntradayBar[]
  height?: number
  overlays?: never
}

type Props = DailyProps | IntradayProps

const OVERLAY_CONFIG = {
  sma_10: { color: '#f6c344', label: 'SMA 10' },
  sma_30: { color: '#3cc7f2', label: 'SMA 30' },
  sma_200: { color: '#8c94ff', label: 'SMA 200' },
  ema_10: { color: '#f28b39', label: 'EMA 10' },
} as const

export default function TerminalChart({ bars, intradayBars, height = 440, overlays = ['sma_10', 'sma_30', 'sma_200'] }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const hasData = bars ? bars.length > 0 : (intradayBars?.length ?? 0) > 0

  useEffect(() => {
    const host = hostRef.current
    if (!host || !hasData) return

    const chart = createChart(host, {
      width: host.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#050607' },
        textColor: '#9aa4af',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#11161c' },
        horzLines: { color: '#11161c' },
      },
      rightPriceScale: {
        borderColor: '#1a2028',
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderColor: '#1a2028',
        fixLeftEdge: true,
        timeVisible: !!intradayBars,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: '#2c333d', labelBackgroundColor: '#0f1318' },
        horzLine: { color: '#2c333d', labelBackgroundColor: '#0f1318' },
      },
    })

    const candles = chart.addCandlestickSeries({
      upColor: '#11b981',
      downColor: '#d24545',
      borderVisible: false,
      wickUpColor: '#11b981',
      wickDownColor: '#d24545',
    })

    if (intradayBars) {
      candles.setData(
        intradayBars.map((bar) => ({
          time: bar.time as unknown as string,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
      )
    } else if (bars) {
      candles.setData(
        bars.map((bar) => ({
          time: bar.date,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
      )

      overlays?.forEach((overlay) => {
        const series = chart.addLineSeries({
          color: OVERLAY_CONFIG[overlay].color,
          lineWidth: overlay === 'sma_200' ? 2 : 1,
          priceLineVisible: false,
          lastValueVisible: true,
        })
        series.setData(
          bars
            .filter((bar) => bar[overlay] != null)
            .map((bar) => ({ time: bar.date, value: bar[overlay] as number })),
        )
      })
    }

    const volume = chart.addHistogramSeries({
      priceScaleId: '',
      priceFormat: { type: 'volume' },
    })
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    })

    if (intradayBars) {
      volume.setData(
        intradayBars.map((bar) => ({
          time: bar.time as unknown as string,
          value: bar.volume,
          color: bar.close >= bar.open ? '#0f6c55' : '#7e2f35',
        })),
      )
    } else if (bars) {
      volume.setData(
        bars.map((bar) => ({
          time: bar.date,
          value: bar.volume,
          color: bar.close >= bar.open ? '#0f6c55' : '#7e2f35',
        })),
      )
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    const observer = new ResizeObserver(() => {
      if (chartRef.current && hostRef.current) {
        chartRef.current.applyOptions({ width: hostRef.current.clientWidth })
      }
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [bars, intradayBars, height, hasData, overlays])

  return <div ref={hostRef} className="chart-host" style={{ height }} />
}
