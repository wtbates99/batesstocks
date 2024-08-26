const API_URL = 'http://localhost:3001/api';

export async function fetchStocks() {
  const response = await fetch(`${API_URL}/stocks`);
  if (!response.ok) {
    throw new Error('Failed to fetch stocks');
  }
  return response.json();
}

export async function fetchStockData(ticker) {
  const response = await fetch(`${API_URL}/stock/${ticker}`);
  if (!response.ok) {
    throw new Error('Failed to fetch stock data');
  }
  return response.json();
}
