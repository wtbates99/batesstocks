import React from 'react';
import StockList from './components/StockList';
import StockChart from './components/StockChart';
import './styles.css';

function App() {
  const [selectedStock, setSelectedStock] = React.useState(null);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8 text-center">Stock Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <StockList onSelectStock={setSelectedStock} />
        </div>
        <div className="md:col-span-2">
          <StockChart selectedStock={selectedStock} />
        </div>
      </div>
    </div>
  );
}

export default App;
