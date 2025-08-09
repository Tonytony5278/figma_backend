# Figma Webhook Backend (Node.js + MongoDB)

This repository provides a minimal Node.js/Express backend designed to work with Figma webhooks. It demonstrates how to:

- Listen for webhook events from Figma.
- Verify the webhook signature using a shared secret.
- Persist event payloads to a MongoDB database via Mongoose.

> **Note:** This code is intended as a starting point. You can expand the model to suit your application's needs or add authentication/authorization as required.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- A MongoDB instance (MongoDB Atlas or local)
- A Figma API personal access token and/or Figma webhook secret (if you enable signature verification)

### 1. Install dependencies

```
cd figma_backend
npm install
```

### 2. Configure environment variables

Copy the provided `.env.example` file to `.env` and update the values:

```
cp .env.example .env
# then edit .env

MONGO_URI=<your MongoDB connection string>
FIGMA_SECRET=<optional shared webhook secret>
PORT=3000
```

The `FIGMA_SECRET` is optional. If set, Figma will sign each webhook payload using HMAC SHA‑256 and include the signature in the `X‑Figma‑Signature` header. The server verifies this signature to ensure the request originated from Figma.

### 3. Run the server locally

```
npm run dev
```

By default the server listens on `http://localhost:3000`. The health check endpoint at `/` can be used to confirm the service is up.

### 4. Deploy to a hosting provider

Choose a platform to host your Node.js app. Popular choices include:

| Platform       | Notes |
|---------------|------|
| **Render**     | Free tier; deploy from GitHub; automatically sets up a server. |
| **Heroku**     | Requires a credit card for free tier; use the Heroku CLI to push code. |
| **Vercel**     | Primarily for serverless functions; can deploy Express via `vercel.json`. |
| **Railway**    | Simple Git‑based deployments and environment variables. |

Follow your provider’s documentation to create a new service from this repository. Ensure your environment variables (`MONGO_URI`, `FIGMA_SECRET`, `PORT`) are configured in the dashboard. Once deployed, note the public URL (e.g., `https://my‑figma‑backend.onrender.com`).

### 5. Register the webhook in Figma

1. Go to [Figma’s developer portal](https://www.figma.com/developers/docs/webhooks).
2. Create a new webhook subscription and specify the callback URL as
   `https://your-deployed-url/figma-webhook`.
3. Select the events you want to subscribe to (e.g., `file_update`).
4. Enter the same `FIGMA_SECRET` you placed in your `.env` file (optional but recommended for verifying requests).
5. Save the webhook.

Whenever an event fires, Figma will send a POST request to the `/figma-webhook` route. If the request is valid, the payload is stored in the `figma_events` collection in MongoDB.

### 6. Querying stored events

You can connect to your MongoDB instance (via MongoDB Compass or the CLI) and view the `figma_events` collection. Each document contains:

- `event_type` – The type of Figma event (e.g., `file_update`).
- `file_key` – The unique key of the Figma file involved.
- `payload` – The entire payload (minus the event type and file key) as a nested document.
- `received_at` – A timestamp of when the event was received.

You can expand or change the schema as necessary—for example, splitting the payload into separate collections, or adding indexes to support queries.

## Additional Tips

- **Security:** If you enable signature verification, always store your webhook secret securely (environment variables or secret managers). Avoid logging the raw secret.
- **Authentication:** This example does not implement user authentication. If your app is multi‑tenant or processes sensitive data, consider adding authentication and authorization.
- **Logging:** Use a logging library (e.g., `winston`, `pino`) to capture request logs, errors and debug information.
- **Testing:** Use a tool like `ngrok` to expose your local server to the internet and test Figma webhooks before deploying.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
