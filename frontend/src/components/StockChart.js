
import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles.css'; // Import your CSS file

const StockChart = ({ ticker }) => {
  const [data, setData] = useState([]);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  useEffect(() => {
    if (ticker) {
      const start = startDate ? startDate.toISOString().split('T')[0] : '';
      const end = endDate ? endDate.toISOString().split('T')[0] : '';

      fetch(`http://localhost:8000/stock/${ticker}?start_date=${start}&end_date=${end}`)
        .then((response) => response.json())
        .then((data) => {
          const sortedData = data.sort((a, b) => new Date(a.Date) - new Date(b.Date));
          setData(sortedData);
        });
    }
  }, [ticker, startDate, endDate]);

  const filteredData = data.filter((d) => {
    const date = new Date(d.Date);
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  });

  if (filteredData.length === 0) return null;

  return (
    <div className="chart-container">
      <div className="date-picker-container">
        <div>
          <label className="date-label">Start Date:</label>
          <DatePicker
            selected={startDate}
            onChange={(date) => setStartDate(date)}
            selectsStart
            startDate={startDate}
            endDate={endDate}
            isClearable
            placeholderText="Select start date"
            className="date-picker"
          />
        </div>
        <div>
          <label className="date-label">End Date:</label>
          <DatePicker
            selected={endDate}
            onChange={(date) => setEndDate(date)}
            selectsEnd
            startDate={startDate}
            endDate={endDate}
            minDate={startDate}
            isClearable
            placeholderText="Select end date"
            className="date-picker"
          />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={filteredData}>
          <XAxis dataKey="Date" stroke="#ffffff" />
          <YAxis stroke="#ffffff" />
          <CartesianGrid strokeDasharray="3 3" stroke="#444444" />
          <Tooltip contentStyle={{ backgroundColor: '#333333', borderColor: '#777777' }} />
          <Line type="monotone" dataKey="Ticker_Close" stroke="#4f46e5" strokeWidth={2} dot={false} />
          {/* Add more lines here for other metrics */}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;
