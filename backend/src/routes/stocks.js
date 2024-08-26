const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');

router.get('/stocks', (req, res) => {
  const db = getDB();
  const query = `
    SELECT DISTINCT Ticker, FullName, Sector, Subsector, MarketCap
    FROM combined_stock_data
    ORDER BY MarketCap DESC
    LIMIT 100
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(400).json({"error": err.message});
      return;
    }
    res.json(rows);
  });
});

router.get('/stock/:ticker', (req, res) => {
  const db = getDB();
  const ticker = req.params.ticker;
  const query = `
    SELECT *
    FROM combined_stock_data
    WHERE Ticker = ?
    ORDER BY Date DESC
    LIMIT 100
  `;

  db.all(query, [ticker], (err, rows) => {
    if (err) {
      res.status(400).json({"error": err.message});
      return;
    }
    res.json(rows);
  });
});

module.exports = router;
