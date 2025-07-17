const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Root endpoint
app.get('/', (req, res) => {
  res.send('PDF Editor Node.js server is running.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
