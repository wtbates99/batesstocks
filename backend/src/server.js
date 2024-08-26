const express = require('express');
const cors = require('cors');
const stockRoutes = require('./routes/stocks');
const { connectDB } = require('./db/database');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Connect to the database
connectDB();

// Use stock routes
app.use('/api', stockRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
