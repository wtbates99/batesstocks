export const metricsList = [
  { name: 'Ticker_Open', color: 'hsl(120, 70%, 50%)' },
  { name: 'Ticker_Close', color: 'hsl(0, 70%, 50%)' },
  { name: 'Ticker_High', color: 'hsl(240, 70%, 50%)' },
  { name: 'Ticker_Low', color: 'hsl(60, 70%, 50%)' },
  { name: 'Ticker_Volume', color: 'hsl(180, 70%, 50%)' },
  { name: 'Ticker_SMA_10', color: 'hsl(30, 70%, 50%)' },
  { name: 'Ticker_SMA_20', color: 'hsl(90, 70%, 50%)' },
  { name: 'Ticker_SMA_50', color: 'hsl(150, 70%, 50%)' },
  { name: 'Ticker_EMA_10', color: 'hsl(210, 70%, 50%)' },
  { name: 'Ticker_EMA_20', color: 'hsl(270, 70%, 50%)' },
  { name: 'Ticker_EMA_50', color: 'hsl(330, 70%, 50%)' },
  { name: 'Ticker_RSI', color: 'hsl(15, 70%, 50%)' },
  { name: 'Ticker_MACD', color: 'hsl(75, 70%, 50%)' },
  { name: 'Ticker_MACD_Signal', color: 'hsl(135, 70%, 50%)' },
  { name: 'Ticker_MACD_Hist', color: 'hsl(195, 70%, 50%)' },
  { name: 'Ticker_Bollinger_Upper', color: 'hsl(255, 70%, 50%)' },
  { name: 'Ticker_Bollinger_Lower', color: 'hsl(315, 70%, 50%)' },
  { name: 'Ticker_Stochastic_K', color: 'hsl(45, 70%, 50%)' },
  { name: 'Ticker_Stochastic_D', color: 'hsl(105, 70%, 50%)' },
  { name: 'Ticker_ATR', color: 'hsl(165, 70%, 50%)' },
  { name: 'Ticker_OBV', color: 'hsl(225, 70%, 50%)' },
  { name: 'Ticker_ADX', color: 'hsl(285, 70%, 50%)' },
  { name: 'Ticker_CCI', color: 'hsl(345, 70%, 50%)' },
  { name: 'Ticker_ROC', color: 'hsl(25, 70%, 50%)' },
  { name: 'Ticker_Williams_R', color: 'hsl(85, 70%, 50%)' },
  { name: 'Ticker_MFI', color: 'hsl(145, 70%, 50%)' },
  { name: 'Ticker_Chaikin_MF', color: 'hsl(205, 70%, 50%)' },
  { name: 'Ticker_UO', color: 'hsl(265, 70%, 50%)' },
  { name: 'Ticker_TSI', color: 'hsl(325, 70%, 50%)' },
  { name: 'Ticker_Force_Index', color: 'hsl(35, 70%, 50%)' },
];

export const groupedMetrics = {
  'Price Data': metricsList.filter((metric) =>
    ['Open', 'Close', 'High', 'Low'].includes(metric.name.replace('Ticker_', ''))
  ),
  'Volume Indicators': metricsList.filter((metric) =>
    metric.name.includes('Volume') ||
    ['Chaikin_MF', 'Force_Index', 'MFI'].some(indicator => metric.name.includes(indicator))
  ),
  'Moving Averages': metricsList.filter(
    (metric) => metric.name.includes('SMA') || metric.name.includes('EMA')
  ),
  'Momentum Oscillators': metricsList.filter(
    (metric) =>
      metric.name.includes('MACD') ||
      metric.name.includes('RSI') ||
      metric.name.includes('Stochastic') ||
      ['TSI', 'UO', 'ROC', 'Williams_R'].some(indicator => metric.name.includes(indicator))
  ),
  'Bollinger Bands': metricsList.filter((metric) => metric.name.includes('Bollinger')),
};
