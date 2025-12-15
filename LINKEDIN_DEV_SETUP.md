# LinkedIn Integration - Local Development Setup

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Add Environment Variables to `.env.local`

```env
# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback

# Supabase (should already exist)
VITE_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Configure LinkedIn App

Go to your LinkedIn App → Auth tab → Add Redirect URL:
```
http://localhost:3000/api/linkedin/callback
```

### 4. Run the Development Server

**Stop your current `npm run dev` and run:**
```bash
npm run dev:linkedin
```

This will start:
- ✅ Vite dev server on `http://localhost:3000`
- ✅ LinkedIn API server on `http://localhost:3001`

## Testing the Connection

1. Go to `http://localhost:3000/dashboard`
2. Navigate to "Social Connections" tab
3. Click "Connect" on LinkedIn card
4. You should be redirected to LinkedIn to authorize
5. After authorization, you'll be redirected back to dashboard
6. LinkedIn should show as "Connected" ✅

## Troubleshooting

### "Missing LinkedIn OAuth configuration"
- Check that `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` are in `.env.local`
- Restart the server after adding env variables

### "Invalid redirect_uri"
- Verify the redirect URI in LinkedIn app matches exactly: `http://localhost:3000/api/linkedin/callback`
- No trailing slashes!

### Connection works but doesn't save
- Check Supabase `social_credentials` table exists
- Verify `SUPABASE_SERVICE_ROLE_KEY` is correct (not the anon key!)

### Popup blocked
- Allow popups for `localhost:3000`
- Or it will fallback to opening in the same tab

## What's Next?

Once connection works:
1. Test posting to LinkedIn
2. Add LinkedIn publish button in ResultsDisplay
3. Deploy to production

## Production Deployment

For production (Vercel):
1. The `/api/linkedin/*` endpoints will use the serverless functions in `/api/linkedin/` folder
2. Update `LINKEDIN_REDIRECT_URI` to your production URL
3. Add redirect URI to LinkedIn app for production domain
