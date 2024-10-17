export const metricsList = [
  // Price Data (Unchanged)
  { name: 'Ticker_Open', color: 'hsl(0, 0%, 100%)' },          // White
  { name: 'Ticker_Close', color: 'hsl(60, 100%, 50%)' },      // Yellow
  { name: 'Ticker_High', color: 'hsl(120, 100%, 40%)' },      // Green
  { name: 'Ticker_Low', color: 'hsl(0, 100%, 50%)' },         // Red

  // Volume Indicators (Blue spectrum)
  { name: 'Ticker_Volume', color: 'hsl(200, 100%, 50%)' },               // Bright Blue
  { name: 'Ticker_On_Balance_Volume', color: 'hsl(240, 100%, 60%)' },    // Royal Blue
  { name: 'Ticker_Chaikin_MF', color: 'hsl(180, 100%, 40%)' },           // Teal
  { name: 'Ticker_Force_Index', color: 'hsl(270, 100%, 60%)' },          // Purple
  { name: 'Ticker_MFI', color: 'hsl(210, 100%, 70%)' },                  // Sky Blue

  // Moving Averages (Warm spectrum)
  { name: 'Ticker_SMA_10', color: 'hsl(0, 100%, 50%)' },                 // Red
  { name: 'Ticker_EMA_10', color: 'hsl(30, 100%, 50%)' },                // Orange
  { name: 'Ticker_SMA_30', color: 'hsl(120, 100%, 50%)' },                // Yellow
  { name: 'Ticker_EMA_30', color: 'hsl(90, 100%, 40%)' },                // Lime Green

  // Momentum Oscillators (Cool spectrum)
  { name: 'Ticker_MACD', color: 'hsl(280, 100%, 50%)' },                 // Purple
  { name: 'Ticker_MACD_Signal', color: 'hsl(320, 100%, 60%)' },          // Pink
  { name: 'Ticker_MACD_Diff', color: 'hsl(200, 100%, 50%)' },            // Blue
  { name: 'Ticker_RSI', color: 'hsl(160, 100%, 40%)' },                  // Green
  { name: 'Ticker_Stochastic_K', color: 'hsl(240, 100%, 60%)' },         // Indigo
  { name: 'Ticker_Stochastic_D', color: 'hsl(180, 100%, 50%)' },         // Cyan
  { name: 'Ticker_TSI', color: 'hsl(300, 100%, 50%)' },                  // Magenta
  { name: 'Ticker_UO', color: 'hsl(220, 100%, 70%)' },                   // Light Blue
  { name: 'Ticker_ROC', color: 'hsl(340, 100%, 50%)' },                  // Hot Pink
  { name: 'Ticker_Williams_R', color: 'hsl(260, 100%, 70%)' },           // Lavender

  // Bollinger Bands (Earth tones)
  { name: 'Ticker_Bollinger_High', color: 'hsl(120, 70%, 40%)' },        // Forest Green
  { name: 'Ticker_Bollinger_Low', color: 'hsl(30, 80%, 50%)' },          // Orange
  { name: 'Ticker_Bollinger_Mid', color: 'hsl(60, 90%, 50%)' },          // Yellow
  { name: 'Ticker_Bollinger_PBand', color: 'hsl(180, 50%, 50%)' },       // Muted Teal
  { name: 'Ticker_Bollinger_WBand', color: 'hsl(0, 60%, 50%)' },         // Muted Red
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
