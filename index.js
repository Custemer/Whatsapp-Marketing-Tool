const express = require("express");
const app = express();
const path = require("path");
const PORT = process.env.PORT || 8000;

// Database connection
const connectDB = require("./config/database");
connectDB();

// Set maximum listeners for EventEmitter
require("events").EventEmitter.defaultMaxListeners = 500;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes
const pairRouter = require("./routes/pair");
const messageRouter = require("./routes/message");

// Use routes
app.use("/code", pairRouter);
app.use("/api", messageRouter);

// Serve static files
app.use(express.static(path.join(__dirname, 'views')));

// Root route to serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// Start the server
app.listen(PORT, () => {
  console.log(`WhatsApp Marketing Tool running on http://localhost:${PORT}`);
});

module.exports = app;
