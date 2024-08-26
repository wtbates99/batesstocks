import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardContent } from './components/ui/card';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { AlertCircle } from 'lucide-react';

const API_URL = 'http://localhost:8000';

const POPULAR_TICKERS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'FB', 'TSLA', 'NVDA', 'JPM', 'JNJ'];

const SparklineChart = ({ data, ticker }) => {
  if (!data || data.length === 0) {
    return (
      <Card className="p-4">
        <CardHeader className="font-bold">{ticker}</CardHeader>
        <CardContent>No data available</CardContent>
      </Card>
    );
  }

  const firstClose = data[0].Ticker_Close;
  const lastClose = data[data.length - 1].Ticker_Close;
  const percentChange = ((lastClose - firstClose) / firstClose * 100).toFixed(2);
  const absoluteChange = (lastClose - firstClose).toFixed(2);

  return (
    <Card className="p-4">
      <CardHeader className="font-bold">{ticker}</CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={60}>
          <LineChart data={data}>
            <Line type="monotone" dataKey="Ticker_Close" stroke="#8884d8" dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-2">
          <span className="font-semibold">{percentChange}%</span>
          <span className="text-sm text-gray-500 ml-2">${absoluteChange}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const MetricChart = ({ data, metrics }) => {
  if (!data || data.length === 0) {
    return <Card className="p-4 mt-4"><CardContent>No data available for the selected metrics</CardContent></Card>;
  }

  return (
    <Card className="p-4 mt-4">
      <CardHeader className="font-bold">Metrics Chart</CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <XAxis dataKey="Date" />
            <YAxis />
            <Tooltip />
            {metrics.map((metric, index) => (
              <Line key={metric} type="monotone" dataKey={metric} stroke={`hsl(${index * 30}, 70%, 50%)`} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const Dashboard = () => {
  const [popularStocks, setPopularStocks] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [tickerData, setTickerData] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [availableMetrics, setAvailableMetrics] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPopularStocks = async () => {
      try {
        const stocksData = await Promise.all(
          POPULAR_TICKERS.map(async (ticker) => {
            const response = await fetch(`${API_URL}/stock/${ticker}?page_size=5`);
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return { ticker, data };
          })
        );
        setPopularStocks(stocksData);
      } catch (error) {
        console.error('Error fetching popular stocks:', error);
        setError('Failed to fetch popular stocks data');
      }
    };

    fetchPopularStocks();
  }, []);

  const fetchTickerData = async (ticker) => {
    try {
      const [stockResponse, companyResponse] = await Promise.all([
        fetch(`${API_URL}/stock/${ticker}?page_size=100`),
        fetch(`${API_URL}/company/${ticker}`)
      ]);

      if (!stockResponse.ok || !companyResponse.ok) {
        throw new Error(`HTTP error! status: ${stockResponse.status} ${companyResponse.status}`);
      }

      const stockData = await stockResponse.json();
      const companyData = await companyResponse.json();

      setTickerData(stockData);
      setCompanyInfo(companyData);
      setAvailableMetrics(Object.keys(stockData[0]).filter(key => key !== 'Date' && key !== 'Ticker'));
      setSelectedMetrics(['Ticker_Close', 'Ticker_SMA_10', 'Ticker_RSI']);
    } catch (error) {
      console.error(`Error fetching data for ${ticker}:`, error);
      setError(`Failed to fetch data for ${ticker}`);
    }
  };

  const handleTickerSubmit = (e) => {
    e.preventDefault();
    if (selectedTicker) {
      fetchTickerData(selectedTicker);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Stock Dashboard</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <AlertCircle className="inline-block mr-2" />
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-4">
        {popularStocks.map(stock => (
          <SparklineChart key={stock.ticker} data={stock.data} ticker={stock.ticker} />
        ))}
      </div>

      <form onSubmit={handleTickerSubmit} className="mb-4">
        <div className="flex">
          <Input
            type="text"
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            placeholder="Enter ticker symbol"
            className="mr-2"
          />
          <Button type="submit">Fetch Data</Button>
        </div>
      </form>

      {companyInfo && (
        <Card className="mb-4">
          <CardHeader className="font-bold">{companyInfo.FullName}</CardHeader>
          <CardContent>
            <p><strong>Sector:</strong> {companyInfo.Sector}</p>
            <p><strong>Industry:</strong> {companyInfo.Subsector}</p>
            <p><strong>Market Cap:</strong> {companyInfo.MarketCap}</p>
            <p><strong>Description:</strong> {companyInfo.Description}</p>
          </CardContent>
        </Card>
      )}

      {tickerData.length > 0 && (
        <>
          <MetricChart data={tickerData} metrics={selectedMetrics} />
          <div className="mt-4">
            <h2 className="text-xl font-bold mb-2">Select Metrics</h2>
            <div className="flex flex-wrap gap-2">
              {availableMetrics.map(metric => (
                <Button
                  key={metric}
                  onClick={() => setSelectedMetrics(prev =>
                    prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric]
                  )}
                  variant={selectedMetrics.includes(metric) ? 'default' : 'outline'}
                >
                  {metric}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
