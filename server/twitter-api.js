import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import crypto from 'crypto';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3002;

// Debug: Log environment variables
console.log('\n🔍 Twitter API Environment Check:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? '✅ Set' : '❌ Missing');
console.log('');

// Twitter Post Endpoint (Text + Link Preview)
app.post('/api/twitter/post', async (req, res) => {
    try {
        const { userId, text, imageUrl } = req.body;

        if (!userId || !text) {
            return res.status(400).json({ error: 'Missing required fields: userId and text' });
        }

        // Initialize Supabase to get tokens
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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

        // Log Rate Limits
        const limit = response.headers.get('x-rate-limit-limit');
        const remaining = response.headers.get('x-rate-limit-remaining');
        const reset = response.headers.get('x-rate-limit-reset');

        if (remaining) {
            console.log(`[Twitter] Rate Limit: ${remaining}/${limit} remaining. Resets at: ${new Date(parseInt(reset) * 1000).toLocaleTimeString()}`);
        }

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

    } catch (error) {
        console.error('[Twitter] Server Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Twitter API server running on http://localhost:${PORT}`);
    console.log(`📍 Endpoints available:`);
    console.log(`   - POST /api/twitter/post`);
});
