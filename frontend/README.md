# BatesStocks Frontend

React frontend for BatesStocks. Built with Create React App, Recharts, and Tailwind CSS.

## Development

```bash
npm install
npm start        # dev server on http://localhost:3000 (proxies API to :8000)
npm run build    # production build to frontend/build/
```

The backend serves the production build at `http://localhost:8000`. For local development, run both the backend (`uv run python main.py`) and the frontend dev server (`npm start`) concurrently.
