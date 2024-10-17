import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import StockChart from '../components/StockChart';
import SearchBar from '../components/SearchBar';
import { metricsList, groupedMetrics } from '../metricsList';
import '../styles.css';

const CompanyPage = () => {
  const { ticker } = useParams();
  const [companyInfo, setCompanyInfo] = useState(null);
  const [startDate, setStartDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30))
  );
  const [endDate, setEndDate] = useState(new Date());
  const [selectedRange, setSelectedRange] = useState(30);
  const [selectedMetrics, setSelectedMetrics] = useState(['Ticker_Close', 'Ticker_SMA_10', 'Ticker_EMA_10', 'Ticker_Bollinger_High', 'Ticker_Bollinger_Low'])
  const [collapsedGroups, setCollapsedGroups] = useState({
    'Price Data': false,
    'Volume Indicators': true,
    'Moving Averages': true,
    'Momentum Oscillators': true,
    'Bollinger Bands': true,
  });

  useEffect(() => {
    const fetchCompanyInfo = async () => {
      try {
        const response = await fetch(`/company/${ticker}`);
        const data = await response.json();
        console.log('Fetched company data:', data); // Add this line
        setCompanyInfo(data);
      } catch (error) {
        console.error('Error fetching company info:', error);
      }
    };

    fetchCompanyInfo();
  }, [ticker]);

  const setDateRange = useCallback((days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
    setSelectedRange(days);
  }, []);

  const toggleMetric = useCallback((metricName) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricName) ? prev.filter((m) => m !== metricName) : [...prev, metricName]
    );
  }, []);

  const toggleGroupCollapse = useCallback((groupName) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  }, []);

  const renderCompanyInfo = () => {
    if (!companyInfo) return null;

    const infoGroups = {
      'General Info': ['FullName', 'Sector', 'Subsector', 'Country', 'Exchange', 'Currency', 'QuoteType'],
      'Financial': ['MarketCap', 'Price', 'DividendRate', 'DividendYield', 'PayoutRatio', 'Beta', 'PE', 'EPS', 'Revenue', 'GrossProfit', 'FreeCashFlow'],
      'Company Details': ['CEO', 'Employees', 'City', 'State', 'Zip', 'Address', 'Phone', 'Website'],
    };

    const formatValue = (key, value) => {
      if (value === null || value === undefined) return 'N/A';
      switch (key) {
        case 'MarketCap':
        case 'Revenue':
        case 'GrossProfit':
        case 'FreeCashFlow':
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
        case 'Price':
        case 'DividendRate':
        case 'EPS':
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
        case 'DividendYield':
        case 'PayoutRatio':
          return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(value);
        case 'Beta':
        case 'PE':
          return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
        case 'Employees':
          return new Intl.NumberFormat('en-US').format(value);
        default:
          return value;
      }
    };

    return (
      <div className="company-info-grid">
        {Object.entries(infoGroups).map(([groupName, fields]) => (
          <div key={groupName} className="info-group">
            <h3>{groupName}</h3>
            <div className="info-items">
              {fields.map(field => {
                const value = companyInfo[field];
                if (value === null || value === undefined || value === '') return null;
                return (
                  <div key={field} className="info-item">
                    <span className="info-label">{field.replace(/([A-Z])/g, ' $1').trim()}:</span>
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

  if (!companyInfo) {
    return <div className="loading">Loading company information...</div>;
  }

  return (
    <div className="company-page">
      <header className="company-header">
        <h1>{companyInfo.FullName} ({ticker})</h1>
        <div className="header-controls">
          <SearchBar />
          <Link to="/" className="back-button">Back to Home</Link>
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
              {Object.entries(groupedMetrics).map(([groupName, groupMetrics]) => (
                <div className="metrics-group" key={groupName}>
                  <h3 onClick={() => toggleGroupCollapse(groupName)} className="group-header">
                    {groupName}
                    <span className={`collapse-icon ${collapsedGroups[groupName] ? 'collapsed' : ''}`}>▼</span>
                  </h3>
                  {!collapsedGroups[groupName] && (
                    <div className="group-metrics">
                      {groupMetrics.map((metric) => (
                        <div
                          key={metric.name}
                          className={`metric-item ${selectedMetrics.includes(metric.name) ? 'selected' : ''}`}
                          onClick={() => toggleMetric(metric.name)}
                          style={{
                            backgroundColor: selectedMetrics.includes(metric.name)
                              ? `${metric.color.replace('hsl', 'hsla').replace('%)', '%, 0.5)')}`
                              : '#2d2d2d',
                            color: selectedMetrics.includes(metric.name) ? '#ffffff' : '#e5e5e5',
                            textShadow: selectedMetrics.includes(metric.name)
                              ? '1px 1px 2px #000000'
                              : 'none',
                            borderColor: '#444444',
                          }}
                        >
                          <span className="metric-label-text">
                            {metric.name.replace(/Ticker_/g, '').replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
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
