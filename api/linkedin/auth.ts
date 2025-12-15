import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * LinkedIn OAuth Authentication Endpoint
 * 
 * Initiates the OAuth flow by redirecting the user to LinkedIn's authorization page.
 * The user will be asked to grant permissions for posting to LinkedIn.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        // Get user ID from query params (passed from frontend)
        const userId = req.query.user_id as string;

        if (!userId) {
            return res.status(400).json({
                error: 'Missing user_id parameter'
            });
        }

        // Get LinkedIn OAuth credentials from environment
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

        if (!clientId || !redirectUri) {
            console.error('Missing LinkedIn OAuth configuration');
            return res.status(500).json({
                error: 'LinkedIn OAuth not configured. Please check environment variables.'
            });
        }

        // Generate a random state parameter for CSRF protection
        const state = Buffer.from(JSON.stringify({
            userId,
            timestamp: Date.now(),
            random: Math.random().toString(36).substring(7)
        })).toString('base64');

        // Define the OAuth scopes we need
        const scopes = [
            'openid',           // Basic authentication
            'profile',          // User profile info
            'email',            // User email
            'w_member_social'   // Permission to post on behalf of user
        ].join(' ');

        // Build LinkedIn OAuth authorization URL
        const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('scope', scopes);

        // Redirect user to LinkedIn authorization page
        res.redirect(authUrl.toString());

    } catch (error) {
        console.error('LinkedIn auth error:', error);
        res.status(500).json({
            error: 'Failed to initiate LinkedIn authentication',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
