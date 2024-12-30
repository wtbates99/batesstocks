# stock-indicators

A self-hosted application for stock data aggregation and visualization, featuring a FastAPI backend and React frontend.

## Features
- Multi-source data aggregation (yfinance)
- SQLite3 database storage
- Interactive stock charts with customizable indicators
- Dynamic stock grid layout
- Real-time data updates
- Comprehensive financial metrics

## Installation

**Prerequisites**: Python 3.7+, Node.js 14+, npm 6+

```bash
# Clone and setup
git clone https://github.com/your-username/Stock_TA_Charts.git
cd Stock_TA_Charts

# Backend setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python puller.py

# Frontend setup
cd frontend/src
npm install
npm run build

# Start server
python3 main.py
```

Access at `http://localhost:8000`

## API Endpoints
- `GET /stock/{ticker}`: Stock data
- `GET /indicators/{ticker}`: Technical indicators
- `GET /company/{ticker}`: Company information

Full API documentation: `http://localhost:8000/docs`

## Contributing
1. Fork repository
2. Create feature branch
3. Submit pull request

For issues: Check database connectivity, run `python puller.py` for fresh data, or clear browser cache.
