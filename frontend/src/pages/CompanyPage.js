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
  const [selectedMetrics, setSelectedMetrics] = useState(['Ticker_Close']);
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

  if (!companyInfo) {
    return <div className="loading">Loading...</div>;
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
            <table>
              <tbody>
                {Object.entries(companyInfo).map(([key, value]) => (
                  <tr key={key}>
                    <td>{key.replace(/([A-Z])/g, ' $1').trim()}</td>
                    <td>{value !== null ? value : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyPage;
