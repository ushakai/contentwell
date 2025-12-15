# LinkedIn Integration Setup Guide

## Prerequisites

1. LinkedIn Developer Account
2. LinkedIn App with "Share on LinkedIn" product approved
3. Admin access to a LinkedIn Page (if posting to company pages)

---

## Step 1: LinkedIn App Configuration

### 1.1 Get Your Credentials

Go to your LinkedIn App at [LinkedIn Developers](https://www.linkedin.com/developers/apps) and note:

- **Client ID**: Found in the "Auth" tab
- **Client Secret**: Found in the "Auth" tab (keep this secure!)

### 1.2 Configure OAuth Settings

In your LinkedIn App's "Auth" tab:

**Add Redirect URLs:**
- Development: `http://localhost:5173/api/linkedin/callback`
- Production: `https://yourdomain.com/api/linkedin/callback`

**Required OAuth 2.0 Scopes:**
- `openid` - Basic authentication
- `profile` - User profile information
- `email` - User email address
- `w_member_social` - **Required for posting to LinkedIn**

### 1.3 Verify Products

Ensure you have these products enabled:
- ✅ "Share on LinkedIn" - For posting capabilities
- ✅ "Sign In with LinkedIn using OpenID Connect" - For authentication

---

## Step 2: Environment Variables

Add these to your `.env.local` file:

```env
# LinkedIn OAuth Configuration
LINKEDIN_CLIENT_ID=your_linkedin_client_id_here
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret_here
LINKEDIN_REDIRECT_URI=http://localhost:5173/api/linkedin/callback

# For production, update LINKEDIN_REDIRECT_URI to:
# LINKEDIN_REDIRECT_URI=https://yourdomain.com/api/linkedin/callback
```

**How to get these values:**
1. Go to https://www.linkedin.com/developers/apps
2. Select your app
3. Click on "Auth" tab
4. Copy "Client ID" and "Client Secret"

---

## Step 3: Supabase Database Setup

Your `social_credentials` table should already exist. Verify it has these columns:

```sql
CREATE TABLE IF NOT EXISTS social_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scope TEXT,
  profile_id TEXT,
  profile_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);
```

---

## Step 4: Testing the Integration

### 4.1 Connect LinkedIn Account

1. Start your dev server: `npm run dev`
2. Navigate to Social Connections page
3. Click "Connect LinkedIn"
4. Authorize the app on LinkedIn
5. You should be redirected back with a success message

### 4.2 Verify Connection

Check your `social_credentials` table in Supabase:
```sql
SELECT * FROM social_credentials WHERE platform = 'linkedin';
```

You should see:
- `access_token` (encrypted)
- `profile_id` (your LinkedIn member ID)
- `profile_data` (your LinkedIn profile info)

### 4.3 Test Posting

1. Generate content in ContentWell
2. Go to Results/Publishing view
3. Click "Publish to LinkedIn" on a social post
4. Check your LinkedIn profile - the post should appear!

---

## LinkedIn API Limits & Constraints

### Rate Limits
- **100 posts per day** per user
- **Throttling**: 500 requests per user per day

### Content Limits
- **Text**: 3,000 characters maximum
- **Images**: Supported (PNG, JPG)
- **Max image size**: 5MB
- **Hashtags**: Recommended 3-5 per post

### Token Expiry
- **Access tokens expire in 60 days**
- **No refresh tokens** - users must re-authenticate after expiry
- The app will prompt for re-connection when tokens expire

---

## Posting to Company Pages (Advanced)

If you want to post to a LinkedIn Company Page instead of personal profile:

### Requirements
1. Request "Marketing Developer Platform" access from LinkedIn
2. Get `w_organization_social` scope approved
3. You must be an admin of the company page
4. Get the Organization ID (URN)

### Finding Organization ID
```bash
# After connecting, call:
GET https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))

# This returns organizations you admin
```

### Posting to Organization
Modify the post request to include:
```json
{
  "author": "urn:li:organization:YOUR_ORG_ID",
  "lifecycleState": "PUBLISHED",
  "specificContent": {
    "com.linkedin.ugc.ShareContent": {
      "shareCommentary": {
        "text": "Your post content"
      },
      "shareMediaCategory": "NONE"
    }
  },
  "visibility": {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
  }
}
```

---

## Troubleshooting

### "Invalid redirect_uri"
- Verify the redirect URI in your LinkedIn app matches exactly
- Check for trailing slashes
- Ensure protocol (http/https) matches

### "Insufficient permissions"
- Verify `w_member_social` scope is requested
- Check that "Share on LinkedIn" product is approved
- Re-authenticate to get new scopes

### "Token expired"
- LinkedIn tokens expire after 60 days
- User needs to reconnect their account
- App will show "Reconnect LinkedIn" button

### Posts not appearing
- Check LinkedIn's spam filters
- Verify content doesn't violate LinkedIn policies
- Check rate limits (100 posts/day)
- Ensure user has posting permissions

---

## Security Best Practices

1. **Never commit** `.env.local` to git
2. **Rotate secrets** regularly in production
3. **Use HTTPS** in production for redirect URIs
4. **Validate** all user input before posting
5. **Handle errors** gracefully and log them
6. **Encrypt** tokens in database (already implemented)

---

## Useful Links

- [LinkedIn OAuth Documentation](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)
- [LinkedIn Share API](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
- [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)
- [API Rate Limits](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits)

---

## Next Steps

After setup is complete:
1. ✅ Environment variables configured
2. ✅ LinkedIn app OAuth settings updated
3. ✅ Database verified
4. ✅ Connection tested
5. ✅ Test post published

You're ready to use LinkedIn integration! 🎉
