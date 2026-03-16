# BatesStocks Frontend

React frontend for BatesStocks. Built with Create React App, Recharts, and Tailwind CSS.

## Development

```bash
npm install
npm start        # dev server on http://localhost:3000 (proxies API to :8000)
npm run build    # production build to frontend/build/
```

The backend serves the production build at `http://localhost:8000`. For local development, run both the backend (`uv run python main.py`) and the frontend dev server (`npm start`) concurrently — the dev server proxies all `/api` and `/stock` calls to the backend automatically.

## Structure

```
src/
  components/
    AiPanel.js              # Floating AI terminal (Ollama / Anthropic / OpenAI)
    SearchBar.js            # Debounced company/ticker search with keyboard nav
    StockChart.js           # Recharts area chart with CSV export
    PresetManager.js        # Save/load ticker+metric view presets (localStorage)
    KeyboardShortcutsHelp.js  # Modal showing all keyboard shortcuts
  pages/
    HomePage.js             # Main dashboard: chart grid, sidebar, header
    CompanyPage.js          # Individual company spotlight page
  hooks/
    useWindowSize.js        # Responsive chart height helper
  metricsList.js            # All 24 indicators with display names and colors
  styles.css                # Full design system (dark + light mode CSS vars)
  App.js                    # Router setup
```

## Key Features

- **Dark/light mode** — toggled with the `☀/☽` button or `t` key; persisted to localStorage
- **Presets** — save any ticker + metric combination by name in the sidebar; stored in localStorage
- **CSV export** — hover any chart card to reveal a download button; exports current date-filtered data
- **AI context** — the AI panel fetches live indicator data for all selected tickers (up to 25) before each message
- **Keyboard shortcuts** — see `KeyboardShortcutsHelp.js` or press `?` in the app

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `\` | Toggle AI Terminal |
| `/` | Focus search bar |
| `t` | Toggle dark / light mode |
| `g` | Cycle through stock groupings |
| `[` | Step to shorter date range |
| `]` | Step to longer date range |
| `?` | Show shortcuts help |
