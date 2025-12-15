import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Twitter Post Publishing Endpoint
 * 
 * Posts content to X (Twitter) on behalf of the authenticated user.
 * Note: Uses Twitter API V2. For images, we currently append the image URL 
 * which Twitter renders as a preview card, as V2 native media upload is complex.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId, text, imageUrl } = req.body;

        if (!userId || !text) {
            return res.status(400).json({ error: 'Missing required fields: userId and text' });
        }

        // Initialize Supabase to get tokens
        // We use the Service Role Key to securely access the credentials table
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('CRITICAL: Missing Supabase config', { url: !!supabaseUrl, key: !!supabaseKey });
            throw new Error('Server configuration error: Missing Supabase credentials');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get Credentials
        const { data: credentials, error: fetchError } = await supabase
            .from('social_credentials')
            .select('*')
            .eq('user_id', userId)
            .eq('platform', 'x')
            .single();

        if (fetchError || !credentials) {
            return res.status(404).json({ error: 'Twitter account not connected. Please connect X in settings.' });
        }

        // Prepare Tweet
        const TWITTER_CHAR_LIMIT = 280;
        let tweetText = text;

        // If image exists, append as link (Twitter shows preview card)
        // Note: Native image upload requires OAuth 1.0a, which is complex. This is the V2 standard way.
        if (imageUrl) {
            const URL_LENGTH = 23;
            const availableChars = TWITTER_CHAR_LIMIT - URL_LENGTH - 1;
            if (tweetText.length > availableChars) {
                tweetText = tweetText.substring(0, availableChars - 3) + '...';
            }
            tweetText = tweetText + ` ${imageUrl}`;
        }

        console.log(`[Twitter] Posting as ${credentials.account_name || 'User'} (Length: ${tweetText.length})`);

        // Post to Twitter V2 API
        const response = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: tweetText })
        });

        // Parse Response
        const data = await response.json();

        if (!response.ok) {
            console.error('[Twitter] API Error:', data);

            // Handle specific 403 Forbidden (Scope issue)
            if (response.status === 403) {
                return res.status(403).json({
                    error: 'Permission Denied. Please disconnect & reconnect X (Twitter) to update permissions.',
                    details: data
                });
            }

            return res.status(response.status).json({
                error: data.detail || 'Failed to post tweet',
                details: data
            });
        }

        console.log('[Twitter] Success:', data.data?.id);
        res.status(200).json({ success: true, data: data });

    } catch (error: any) {
        console.error('[Twitter] Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
