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
// ---- added: payments & AI support ----
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const OpenAI = require('openai');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// allow your front-ends
const allowed = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

const PORT = process.env.PORT || 3000;

// Configure middleware to parse JSON bodies
// ---- added: Stripe webhook (requires RAW body) ----
app.post('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,                         // RAW body here
      sig,
      process.env.STRIPE_WEBHOOK_SECRET // set in Render
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // TODO: mark user premium / save subscription in your DB
      // console.log('Checkout completed', session.id);
    }

    res.json({ received: true });
  } catch(err) {
    console.error('Webhook verify failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

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
// --- Add: User model for Stripe + referrals ---
const userSchema = new mongoose.Schema({
  email: { type: String, index: true, unique: true, sparse: true },
  stripeCustomerId: String,
  subscriptionStatus: { type: String, default: 'free' }, // 'free' | 'active' | 'trialing' | 'canceled' | etc.
  currentPeriodEnd: Date,
  referralCode: { type: String, index: true },           // this user's own code they share
  referredBy: String,                                     // code used by this user (who referred them)
  premiumUntil: Date                                      // manual premium (e.g., a 1-week reward)
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);


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

// ---- added: create a Checkout Session ----
// ---- updated: create a Checkout Session (email + referral-aware) ----
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const {
      priceId,
      email,                                 // <-- NEW: customer email from the client
      mode = 'subscription',
      successPath = '/success',
      cancelPath = '/cancel',
      referralCode,                          // optional: code from the referrer
      trialDays                              // optional: override trial days
    } = req.body;

    // If you don't have user auth yet, default to your email for testing:
    const customerEmail = email || 'nurseaiteam@gmail.com';

    // Metadata we want on the session/subscription
    const meta = {
      referralCode: referralCode || '',
      appUserEmail: customerEmail
    };

    // Subscription data (for trials + metadata)
    const subscription_data = { metadata: meta };

    // Referral trial: if there's a referralCode and no explicit trialDays, give 7 days
    let trial = Number(trialDays);
    if (isNaN(trial)) {
      trial = referralCode ? 7 : 0;
    }
    if (trial > 0) {
      subscription_data.trial_period_days = trial;
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: customerEmail,                         // <-- attach email
      success_url: `${process.env.APP_URL}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}${cancelPath}`,
      subscription_data,
      metadata: meta
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err);
    res.status(500).json({ error: 'Unable to create session' });
  }
});


    res.json({ url: session.url });
  .catch(err) {
    console.error('create-checkout-session error', err);
    res.status(500).json({ error: 'Unable to create session' });
  }
});

// ---- added: AI tutor proxy to OpenAI ----
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages } = req.body; // [{role:'user', content:'...'}]
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages
    });
    res.json(completion.choices[0].message);
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'AI error' });
  }
});

// (LAST) start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
// Create Customer Portal session
app.post('/api/stripe/create-portal-session', async (req, res) => {
  try {
    const { email, returnUrl } = req.body;
    // TODO: replace with your real auth lookup
    const user = await User.findOne({ email });
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe customer on file' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl || `${process.env.APP_URL}/account`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('create-portal-session error', err);
    res.status(500).json({ error: 'Unable to create portal session' });
  }
});

