import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * LinkedIn OAuth Callback Endpoint
 * 
 * Handles the OAuth callback from LinkedIn after user authorization.
 * Exchanges the authorization code for access tokens and stores them in the database.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const { code, state, error, error_description } = req.query;

        // Handle OAuth errors from LinkedIn
        if (error) {
            console.error('LinkedIn OAuth error:', error, error_description);
            return res.redirect(
                `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?error=linkedin_auth_failed&message=${encodeURIComponent(error_description as string || 'Authentication failed')}`
            );
        }

        // Validate required parameters
        if (!code || !state) {
            return res.status(400).json({
                error: 'Missing code or state parameter'
            });
        }

        // Decode and validate state parameter
        let stateData;
        try {
            stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
        } catch (e) {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        const { userId } = stateData;

        if (!userId) {
            return res.status(400).json({ error: 'Invalid state: missing userId' });
        }

        // Get LinkedIn OAuth credentials
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

        if (!clientId || !clientSecret || !redirectUri) {
            console.error('Missing LinkedIn OAuth configuration');
            return res.status(500).json({
                error: 'LinkedIn OAuth not configured'
            });
        }

        // Exchange authorization code for access token
        const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code as string,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error('LinkedIn token exchange failed:', errorData);
            return res.redirect(
                `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?error=token_exchange_failed`
            );
        }

        const tokenData = await tokenResponse.json();
        const { access_token, expires_in, scope } = tokenData;

        // Get user profile information from LinkedIn
        const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        if (!profileResponse.ok) {
            console.error('Failed to fetch LinkedIn profile');
            return res.redirect(
                `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?error=profile_fetch_failed`
            );
        }

        const profileData = await profileResponse.json();
        const { sub: linkedinId, name, email, picture } = profileData;

        // Calculate token expiration time
        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        // Initialize Supabase client
        // Initialize Supabase client
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('CRITICAL: Missing Supabase config', { url: !!supabaseUrl, key: !!supabaseKey });
            throw new Error('Server misconfiguration: Missing Supabase credentials');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Store credentials in database (upsert to handle reconnections)
        const { error: dbError } = await supabase
            .from('social_credentials')
            .upsert({
                user_id: userId,
                platform: 'linkedin',
                access_token: access_token,
                refresh_token: null, // LinkedIn doesn't provide refresh tokens
                expires_at: expiresAt,
                scope: scope,
                profile_id: linkedinId,
                profile_data: {
                    name,
                    email,
                    picture,
                    linkedinId
                },
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,platform'
            });

        if (dbError) {
            console.error('Database error:', dbError);
            return res.redirect(
                `/linkedin-callback.html?error=database_error&message=${encodeURIComponent(dbError.message)}`
            );
        }

        // Success! Redirect to callback page which handles popup closure
        res.redirect(
            `/linkedin-callback.html?success=linkedin_connected&name=${encodeURIComponent(name || 'LinkedIn User')}`
        );

    } catch (error) {
        console.error('LinkedIn callback error:', error);
        res.redirect(
            `/linkedin-callback.html?error=unexpected_error`
        );
    }
}
