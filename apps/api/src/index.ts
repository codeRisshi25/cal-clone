import "dotenv/config";
import express, { Application } from "express";
import cors from "cors";
import eventTypesRouter from "./routes/eventTypes";
import availabilityRouter from "./routes/availability";
import bookingsRouter from "./routes/bookings";
import publicRouter from "./routes/public";

const app: Application = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Admin routes — assume a single pre-seeded admin user "risshi"
app.use("/api/admin/event-types", eventTypesRouter);
app.use("/api/admin/availability", availabilityRouter);
app.use("/api/admin/bookings", bookingsRouter);

// Public routes — for the booking page
app.use("/api/public", publicRouter);

// Generic error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

export default app;
