# stock-indicators

## Table of Contents
1. [Introduction](#introduction)
2. [Features](#features)
3. [Installation](#installation)
4. [Usage](#usage)
5. [API Reference](#api-reference)
6. [Frontend Components](#frontend-components)
7. [Data Processing](#data-processing)
8. [Troubleshooting](#troubleshooting)
9. [Contributing](#contributing)

## Introduction

The Stock Data Aggregator & Visualizer is a self-hosted application designed to aggregate stock data from multiple sources and provide interactive visualizations. It consists of a FastAPI backend for data processing and storage, and a React frontend for user interaction and data display.

## Features

- Data aggregation from various sources (e.g., yfinance)
- Local storage using SQLite3 database
- Interactive stock charts with customizable indicators
- Dynamic stock grid with adjustable layout
- Real-time data updates
- Comprehensive financial metrics and indicators

## Installation

### Prerequisites
- Python 3.7+
- Node.js 14+
- npm 6+

### Step-by-step Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/Stock_TA_Charts.git
   cd Stock_TA_Charts
   ```

2. Set up the Python environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Populate the SQLite database:
   ```bash
   python puller.py
   ```

4. Set up the frontend:
   ```bash
   cd frontend/src
   npm install
   npm run build
   ```

5. Start the backend server:
   ```bash
   python3 main.py
   ```

6. Access the application at `http://localhost:8000`

## Usage

### Navigating the Interface

The main interface consists of a grid of stock charts. You can:

- Use the search bar to find specific stocks
- Click on a stock to view detailed information
- Adjust the date range using the buttons in the sidebar
- Toggle different metrics and indicators for each chart

### Customizing Charts

To customize the charts:

1. Open the sidebar by clicking the menu icon
2. Select or deselect metrics from the available options
3. The charts will update in real-time to reflect your choices

### Analyzing Stock Data

- Use the various indicators to identify trends and patterns
- Compare multiple stocks side-by-side
- Adjust the time frame to view long-term or short-term trends

## API Reference

The backend API provides several endpoints for data retrieval and processing. Here are the main endpoints:

- `GET /stock/{ticker}`: Retrieve data for a specific stock
- `GET /indicators/{ticker}`: Get calculated indicators for a stock
- `GET /company/{ticker}`: Fetch company information

For a complete API reference, refer to the FastAPI documentation available at `http://localhost:8000/docs` when the server is running.

## Frontend Components

The frontend is built using React and consists of several key components:

1. `StockChart`: Renders individual stock charts
   ```javascript:frontend/src/components/StockChart.js
   startLine: 32
   endLine: 207
   ```

2. `SearchBar`: Provides stock search functionality
   ```javascript:frontend/src/components/SearchBar.js
   startLine: 1
   endLine: 78
   ```

3. `HomePage`: Main page component displaying the stock grid
   ```javascript:frontend/src/pages/HomePage.js
   startLine: 1
   endLine: 249
   ```

4. `CompanyPage`: Detailed view for individual stocks
   ```javascript:frontend/src/pages/CompanyPage.js
   startLine: 1
   endLine: 201
   ```

## Data Processing

The backend handles data processing and storage. Key files include:

1. `data_manipulation.py`: Processes stock data and calculates indicators
   ```python:backend/data_manipulation.py
   startLine: 1
   endLine: 260
   ```

2. `main.py`: Contains the FastAPI application and route definitions

## Troubleshooting

Common issues and their solutions:

1. **Database connection errors**: Ensure that the `stock_data.db` file exists and has the correct permissions.
2. **Missing data**: Run `python puller.py` to fetch the latest stock data.
3. **Frontend not updating**: Clear your browser cache or try a hard refresh (Ctrl + F5).

## Contributing

Contributions to the Stock Data Aggregator & Visualizer are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch for your feature
3. Commit your changes
4. Push to your fork and submit a pull request

Please ensure your code adheres to the existing style and passes all tests before submitting a pull request.
