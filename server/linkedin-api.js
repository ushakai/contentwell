import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root
dotenv.config({ path: join(__dirname, '..', '.env.local') });
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// Debug: Log environment variables (without exposing secrets)
console.log('\n🔍 Environment Variables Check:');
console.log('LINKEDIN_CLIENT_ID:', process.env.LINKEDIN_CLIENT_ID ? '✅ Set' : '❌ Missing');
console.log('LINKEDIN_CLIENT_SECRET:', process.env.LINKEDIN_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
console.log('LINKEDIN_REDIRECT_URI:', process.env.LINKEDIN_REDIRECT_URI || '❌ Missing');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? '✅ Set' : '❌ Missing');
console.log('');

// LinkedIn Auth Endpoint
app.get('/api/linkedin/auth', async (req, res) => {
    try {
        const userId = req.query.user_id;

        if (!userId) {
            return res.status(400).json({ error: 'Missing user_id parameter' });
        }

        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/linkedin/callback';

        if (!clientId || !redirectUri) {
            console.error('Missing LinkedIn OAuth configuration');
            return res.status(500).json({
                error: 'LinkedIn OAuth not configured. Please check environment variables.'
            });
        }

        // Generate state for CSRF protection
        const state = Buffer.from(JSON.stringify({
            userId,
            timestamp: Date.now(),
            random: Math.random().toString(36).substring(7)
        })).toString('base64');

        // Define OAuth scopes
        const scopes = [
            'openid',
            'profile',
            'email',
            'w_member_social'           // Post to personal profile
            // Note: w_organization_social requires "Community Management API" access from LinkedIn
            // Request it from: https://www.linkedin.com/developers/apps/YOUR_APP_ID/products
        ].join(' ');

        // Build LinkedIn OAuth URL
        const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('scope', scopes);

        res.redirect(authUrl.toString());

    } catch (error) {
        console.error('LinkedIn auth error:', error);
        res.status(500).json({
            error: 'Failed to initiate LinkedIn authentication',
            details: error.message
        });
    }
});

// LinkedIn Callback Endpoint
app.get('/api/linkedin/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            console.error('LinkedIn OAuth error:', error, error_description);
            return res.redirect(
                `/linkedin-callback.html?error=linkedin_auth_failed&message=${encodeURIComponent(error_description || 'Authentication failed')}`
            );
        }

        if (!code || !state) {
            return res.status(400).json({ error: 'Missing code or state parameter' });
        }

        // Decode state
        let stateData;
        try {
            stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        } catch (e) {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        const { userId } = stateData;

        if (!userId) {
            return res.status(400).json({ error: 'Invalid state: missing userId' });
        }

        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        const redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/linkedin/callback';

        if (!clientId || !clientSecret || !redirectUri) {
            console.error('Missing LinkedIn OAuth configuration');
            return res.status(500).json({ error: 'LinkedIn OAuth not configured' });
        }

        // Exchange code for token
        const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error('LinkedIn token exchange failed:', errorData);
            return res.redirect(
                `/linkedin-callback.html?error=token_exchange_failed`
            );
        }

        const tokenData = await tokenResponse.json();
        const { access_token, expires_in, scope } = tokenData;

        // Get user profile
        const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        if (!profileResponse.ok) {
            console.error('Failed to fetch LinkedIn profile');
            return res.redirect(
                `/linkedin-callback.html?error=profile_fetch_failed`
            );
        }

        const profileData = await profileResponse.json();
        console.log('📋 LinkedIn Profile Data:', profileData);

        const { sub: linkedinId, name, email, picture } = profileData;

        console.log('📋 Extracted Profile Info:', {
            linkedinId,
            name,
            email,
            hasPicture: !!picture
        });

        if (!linkedinId) {
            console.error('❌ LinkedIn ID (sub) is missing from profile response!');
            return res.redirect(
                `/linkedin-callback.html?error=profile_id_missing&message=LinkedIn did not return a user ID`
            );
        }

        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        // Validate Supabase configuration
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('Missing Supabase configuration:', {
                hasUrl: !!supabaseUrl,
                hasKey: !!supabaseKey
            });
            return res.redirect(
                `/linkedin-callback.html?error=database_config_error&message=Supabase not configured`
            );
        }

        console.log('📊 Attempting to save to Supabase:', {
            url: supabaseUrl,
            userId: userId,
            platform: 'linkedin'
        });

        // Store in Supabase
        const supabase = createClient(supabaseUrl, supabaseKey);

        try {
            const { error: dbError } = await supabase
                .from('social_credentials')
                .upsert({
                    user_id: userId,
                    platform: 'linkedin',
                    access_token: access_token,
                    token_type: 'bearer',
                    expires_at: expiresAt,
                    scopes: scope ? scope.split(' ') : [],
                    account_id: linkedinId,
                    account_name: name,
                    metadata: {
                        email,
                        picture,
                        linkedinId
                    },
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id,platform'
                });

            if (dbError) {
                console.error('❌ Supabase upsert error:', {
                    message: dbError.message,
                    details: dbError.details,
                    hint: dbError.hint,
                    code: dbError.code
                });
                return res.redirect(
                    `/linkedin-callback.html?error=database_error&message=${encodeURIComponent(dbError.message)}`
                );
            }

            console.log('✅ Successfully saved LinkedIn credentials to database');

        } catch (dbException) {
            console.error('❌ Database exception:', {
                name: dbException.name,
                message: dbException.message,
                stack: dbException.stack,
                cause: dbException.cause
            });
            return res.redirect(
                `/linkedin-callback.html?error=database_exception&message=${encodeURIComponent(dbException.message)}`
            );
        }

        res.redirect(
            `/linkedin-callback.html?success=linkedin_connected&name=${encodeURIComponent(name || 'LinkedIn User')}`
        );

    } catch (error) {
        console.error('LinkedIn callback error:', error);
        res.redirect(
            `/linkedin-callback.html?error=unexpected_error`
        );
    }
});

// LinkedIn Post Endpoint
app.post('/api/linkedin/post', async (req, res) => {
    try {
        const { userId, text, imageUrl } = req.body;

        if (!userId || !text) {
            return res.status(400).json({
                error: 'Missing required fields: userId and text are required'
            });
        }

        if (text.length > 3000) {
            return res.status(400).json({
                error: 'Text exceeds LinkedIn limit of 3000 characters',
                currentLength: text.length
            });
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY
        );

        const { data: credentials, error: fetchError } = await supabase
            .from('social_credentials')
            .select('*')
            .eq('user_id', userId)
            .eq('platform', 'linkedin')
            .single();

        console.log('🔍 Fetched credentials:', {
            found: !!credentials,
            error: fetchError,
            account_id: credentials?.account_id,
            account_name: credentials?.account_name,
            hasToken: !!credentials?.access_token
        });

        if (fetchError || !credentials) {
            return res.status(404).json({
                error: 'LinkedIn account not connected',
                message: 'Please connect your LinkedIn account first'
            });
        }

        const expiresAt = new Date(credentials.expires_at);
        const now = new Date();

        if (expiresAt < now) {
            return res.status(401).json({
                error: 'LinkedIn token expired',
                message: 'Please reconnect your LinkedIn account',
                requiresReauth: true
            });
        }

        const accessToken = credentials.access_token;
        const accountId = credentials.account_id;

        console.log('📤 Posting to LinkedIn:', {
            userId,
            accountId,
            hasToken: !!accessToken,
            textLength: text.length
        });

        let mediaAsset = null;

        // Step 1: Upload Image (if provided)
        if (imageUrl) {
            console.log('[LinkedIn] Starting image upload process...');
            try {
                // A. Register Upload
                const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        registerUploadRequest: {
                            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                            owner: `urn:li:person:${accountId}`,
                            serviceRelationships: [{
                                relationshipType: 'OWNER',
                                identifier: 'urn:li:userGeneratedContent'
                            }]
                        }
                    })
                });

                if (!registerResponse.ok) throw new Error('Failed to register upload');

                const registerData = await registerResponse.json();
                const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
                mediaAsset = registerData.value.asset;

                console.log('[LinkedIn] Upload registered, asset:', mediaAsset);

                // B. Download Image
                const imageResponse = await fetch(imageUrl);
                const imageArrayBuffer = await imageResponse.arrayBuffer();
                const imageBuffer = Buffer.from(imageArrayBuffer);

                // C. Upload Binary to LinkedIn
                const uploadResponse = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/octet-stream'
                    },
                    body: imageBuffer
                });

                if (!uploadResponse.ok) throw new Error('Failed to upload image binary');
                console.log('[LinkedIn] Image binary uploaded successfully');

            } catch (error) {
                console.error('[LinkedIn] Image upload failed:', error);
                // Fallback to text link if upload fails
                text = `${text}\n\nImage: ${imageUrl}`;
                mediaAsset = null;
            }
        }

        // Step 2: Create Post
        const postPayload = {
            author: `urn:li:person:${accountId}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text: text },
                    shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE',
                    media: mediaAsset ? [{
                        status: 'READY',
                        description: { text: 'Shared via ContentWell' },
                        media: mediaAsset,
                        title: { text: 'Shared Image' }
                    }] : undefined
                }
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
            }
        };

        // Post to LinkedIn
        const postResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0'
            },
            body: JSON.stringify(postPayload)
        });

        if (!postResponse.ok) {
            const errorData = await postResponse.text();
            console.error('LinkedIn post failed:', errorData);

            let errorMessage = 'Failed to post to LinkedIn';
            try {
                const errorJson = JSON.parse(errorData);
                errorMessage = errorJson.message || errorMessage;
            } catch (e) {
                // Use default message
            }

            return res.status(postResponse.status).json({
                error: errorMessage,
                details: errorData
            });
        }

        const responseData = await postResponse.json();

        res.status(200).json({
            success: true,
            message: 'Successfully posted to LinkedIn',
            postId: responseData.id,
            data: responseData
        });

    } catch (error) {
        console.error('LinkedIn post error:', error);
        res.status(500).json({
            error: 'Failed to post to LinkedIn',
            details: error.message
        });
    }
});

// LinkedIn Disconnect Endpoint
app.post('/api/linkedin/disconnect', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'Missing required field: userId' });
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY
        );

        const { error: deleteError } = await supabase
            .from('social_credentials')
            .delete()
            .eq('user_id', userId)
            .eq('platform', 'linkedin');

        if (deleteError) {
            console.error('Failed to delete LinkedIn credentials:', deleteError);
            return res.status(500).json({
                error: 'Failed to disconnect LinkedIn account',
                details: deleteError.message
            });
        }

        res.status(200).json({
            success: true,
            message: 'LinkedIn account disconnected successfully'
        });

    } catch (error) {
        console.error('LinkedIn disconnect error:', error);
        res.status(500).json({
            error: 'Failed to disconnect LinkedIn account',
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`✅ LinkedIn API server running on http://localhost:${PORT}`);
    console.log(`📍 Endpoints available:`);
    console.log(`   - GET  /api/linkedin/auth`);
    console.log(`   - GET  /api/linkedin/callback`);
    console.log(`   - POST /api/linkedin/post`);
    console.log(`   - POST /api/linkedin/disconnect`);
});
