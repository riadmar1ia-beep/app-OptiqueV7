import "reflect-metadata";
import express from "express";
import { config } from "dotenv";
import { AppDataSource } from "./data-source";

config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/db-test", async (req, res) => {
  try {
    const isConnected = AppDataSource.isInitialized;
    res.json({ 
      connected: isConnected,
      message: isConnected ? "? DB connected" : "? DB not connected"
    });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// D?marrer avec DB
AppDataSource.initialize()
  .then(() => {
    console.log("? Database connected");
    app.listen(PORT, () => {
      console.log(`?? Server running on http://localhost:${PORT}`);
      console.log(`?? Health: http://localhost:${PORT}/health`);
      console.log(`???  DB Test: http://localhost:${PORT}/db-test`);
    });
  })
  .catch((err) => {
    console.error("? DB connection failed:", err.message);
    app.listen(PORT, () => {
      console.log(`?? Server running (without DB) on http://localhost:${PORT}`);
    });
  });
