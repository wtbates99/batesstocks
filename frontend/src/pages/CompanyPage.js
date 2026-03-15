import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import StockChart from '../components/StockChart';
import SearchBar from '../components/SearchBar';
import { metricsList, groupedMetrics } from '../metricsList';
import '../styles.css';

const CompanyPage = () => {
  const { ticker } = useParams();
  const [companyInfo, setCompanyInfo]           = useState(null);
  const [priceData, setPriceData]               = useState(null);
  const [startDate, setStartDate]               = useState(new Date(Date.now() - 30 * 86400000));
  const [endDate, setEndDate]                   = useState(new Date());
  const [selectedRange, setSelectedRange]       = useState(30);
  const [selectedMetrics, setSelectedMetrics]   = useState([
    'Ticker_Close', 'Ticker_SMA_10', 'Ticker_Bollinger_High', 'Ticker_Bollinger_Low',
  ]);
  const [collapsedGroups, setCollapsedGroups]   = useState({
    'Price Data':           false,
    'Volume Indicators':    true,
    'Moving Averages':      true,
    'Momentum Oscillators': true,
    'Bollinger Bands':      true,
  });

  useEffect(() => {
    setCompanyInfo(null);
    setPriceData(null);
    fetch(`/company/${ticker}`)
      .then((r) => r.json())
      .then(setCompanyInfo)
      .catch(console.error);
  }, [ticker]);

  const setDateRange = useCallback((days) => {
    setStartDate(new Date(Date.now() - days * 86400000));
    setEndDate(new Date());
    setSelectedRange(days);
  }, []);

  const toggleMetric = useCallback((name) => {
    setSelectedMetrics((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]
    );
  }, []);

  const toggleGroupCollapse = useCallback((name) => {
    setCollapsedGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const formatValue = (key, value) => {
    if (value === null || value === undefined) return 'N/A';
    switch (key) {
      case 'MarketCap': case 'Revenue': case 'GrossProfit': case 'FreeCashFlow':
        return new Intl.NumberFormat('en-US', {
          style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
        }).format(value);
      case 'Price': case 'DividendRate': case 'EPS':
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
      case 'DividendYield': case 'PayoutRatio':
        return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(value);
      case 'Beta': case 'PE':
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
      case 'Employees':
        return new Intl.NumberFormat('en-US').format(value);
      default:
        return value;
    }
  };

  const renderCompanyInfo = () => {
    if (!companyInfo) return null;
    const groups = {
      'General':    ['FullName', 'Sector', 'Subsector', 'Country', 'Exchange', 'Currency', 'QuoteType'],
      'Financials': ['MarketCap', 'Price', 'DividendRate', 'DividendYield', 'PayoutRatio', 'Beta', 'PE', 'EPS', 'Revenue', 'GrossProfit', 'FreeCashFlow'],
      'Company':    ['CEO', 'Employees', 'City', 'State', 'Address', 'Phone', 'Website'],
    };

    return (
      <div className="company-info-grid">
        {Object.entries(groups).map(([groupName, fields]) => (
          <div key={groupName} className="info-group">
            <h3>{groupName}</h3>
            <div className="info-items">
              {fields.map((field) => {
                const value = companyInfo[field];
                if (value === null || value === undefined || value === '') return null;
                return (
                  <div key={field} className="info-item">
                    <span className="info-label">{field.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="info-value">{formatValue(field, value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (!companyInfo) return <div className="loading">Loading {ticker}...</div>;

  const change = priceData ? priceData.latestClose - priceData.prevClose : 0;
  const pct    = priceData?.prevClose ? (change / priceData.prevClose) * 100 : 0;
  const isPos  = change >= 0;

  return (
    <div className="company-page">
      <header className="company-header">
        <div className="company-header-left">
          <h1>{companyInfo.FullName} ({ticker})</h1>
          {priceData && (
            <div className="company-header-price">
              <span className="company-current-price">${priceData.latestClose.toFixed(2)}</span>
              <span className={`company-price-change ${isPos ? 'positive' : 'negative'}`}>
                {isPos ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({Math.abs(pct).toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        <div className="header-controls">
          <SearchBar />
          <Link to="/" className="back-button">← Back</Link>
        </div>
      </header>

      <div className="company-content">
        <div className="company-chart-container">
          <StockChart
            initialTicker={ticker}
            startDate={startDate}
            endDate={endDate}
            metrics={selectedMetrics}
            metricsList={metricsList}
            onDataLoaded={setPriceData}
          />
        </div>

        <div className="company-details">
          <div className="company-sidebar">
            <div className="date-buttons-grid">
              {[7, 30, 90, 180, 365, 730, 1095, 1460, 1825].map((days) => (
                <button
                  key={days}
                  className={`date-button ${selectedRange === days ? 'active' : ''}`}
                  onClick={() => setDateRange(days)}
                >
                  {days >= 365 ? `${days / 365}Y` : `${days}D`}
                </button>
              ))}
            </div>

            <div className="metrics-section">
              {Object.entries(groupedMetrics).map(([groupName, gMetrics]) => (
                <div className="metrics-group" key={groupName}>
                  <h3 className="group-header" onClick={() => toggleGroupCollapse(groupName)}>
                    {groupName}
                    <span className={`collapse-icon ${collapsedGroups[groupName] ? 'collapsed' : ''}`}>▼</span>
                  </h3>
                  {!collapsedGroups[groupName] && (
                    <div className="group-metrics">
                      {gMetrics.map((metric) => {
                        const isSelected = selectedMetrics.includes(metric.name);
                        return (
                          <div
                            key={metric.name}
                            className={`metric-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleMetric(metric.name)}
                            style={isSelected ? {
                              backgroundColor: metric.color.replace('hsl', 'hsla').replace('%)', '%, 0.12)'),
                              borderColor:     metric.color.replace('hsl', 'hsla').replace('%)', '%, 0.35)'),
                            } : undefined}
                          >
                            <span className="metric-color-dot" style={{ backgroundColor: metric.color }} />
                            <span className="metric-label-text">
                              {metric.name.replace(/Ticker_/g, '').replace(/_/g, ' ')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="company-info">
            <h2>Company Information</h2>
            {renderCompanyInfo()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyPage;
