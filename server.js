/*
 * Simple Express server to handle Figma webhooks and store incoming
 * events in a MongoDB collection. This example uses Mongoose to
 * establish a connection and define a schema. It also includes
 * optional verification of the webhook signature using a shared
 * secret. You should deploy this service to a publicly accessible
 * platform (Heroku, Render, Vercel, etc.) and configure the
 * corresponding URL as your webhook callback in Figma.
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware to parse JSON bodies
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Define a simple schema and model for incoming Figma webhook events
const figmaEventSchema = new mongoose.Schema(
  {
    event_type: String,
    file_key: String,
    payload: mongoose.Schema.Types.Mixed,
    received_at: { type: Date, default: Date.now },
  },
  {
    collection: 'figma_events',
  }
);
const FigmaEvent = mongoose.model('FigmaEvent', figmaEventSchema);

// Helper to verify Figma webhook signature
function verifySignature(req) {
  const secret = process.env.FIGMA_SECRET;
  if (!secret) return true; // Skip verification if no secret configured

  const signatureHeader = req.get('X-Figma-Signature');
  if (!signatureHeader) return false;
  const hmac = crypto.createHmac('sha256', secret);
  // Figma uses the raw body string to compute the HMAC
  const rawBody = JSON.stringify(req.body);
  const digest = hmac.update(rawBody).digest('hex');
  // Constant time comparison
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(digest));
}

// Webhook endpoint to receive events from Figma
app.post('/figma-webhook', async (req, res) => {
  // Verify signature if secret is provided
  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event_type, file_key, ...rest } = req.body;
  try {
    // Save the event to MongoDB
    await FigmaEvent.create({
      event_type,
      file_key,
      payload: rest,
    });
    // Respond with 200 to acknowledge receipt
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error saving event:', err);
    res.status(500).json({ error: 'Failed to process event' });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Figma webhook backend is running');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});