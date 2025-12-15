import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * LinkedIn Post Publishing Endpoint
 * 
 * Posts content to LinkedIn on behalf of the authenticated user.
 * Supports text posts and posts with images.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId, text, imageUrl } = req.body;

        // Validate required fields
        if (!userId || !text) {
            return res.status(400).json({
                error: 'Missing required fields: userId and text are required'
            });
        }

        // Validate text length (LinkedIn limit is 3000 characters)
        if (text.length > 3000) {
            return res.status(400).json({
                error: 'Text exceeds LinkedIn limit of 3000 characters',
                currentLength: text.length
            });
        }

        // Initialize Supabase client
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Fetch LinkedIn credentials from database
        const { data: credentials, error: fetchError } = await supabase
            .from('social_credentials')
            .select('*')
            .eq('user_id', userId)
            .eq('platform', 'linkedin')
            .single();

        if (fetchError || !credentials) {
            return res.status(404).json({
                error: 'LinkedIn account not connected',
                message: 'Please connect your LinkedIn account first'
            });
        }

        // Check if token is expired
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
        // Map account_id (from DB) to profileId (used in logic below)
        const profileId = credentials.account_id;

        if (!profileId) {
            console.error('LinkedIn Profile ID missing in credentials');
            return res.status(500).json({ error: 'LinkedIn profile ID not found. Please reconnect account.' });
        }

        // Prepare the post payload
        const postPayload: any = {
            author: `urn:li:person:${profileId}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: {
                        text: text
                    },
                    shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE'
                }
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
            }
        };

        // If image is provided, upload it first
        if (imageUrl) {
            try {
                // Step 1: Register the image upload
                const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'X-Restli-Protocol-Version': '2.0.0'
                    },
                    body: JSON.stringify({
                        registerUploadRequest: {
                            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                            owner: `urn:li:person:${profileId}`,
                            serviceRelationships: [{
                                relationshipType: 'OWNER',
                                identifier: 'urn:li:userGeneratedContent'
                            }]
                        }
                    })
                });

                if (!registerResponse.ok) {
                    const errorText = await registerResponse.text();
                    console.error('LinkedIn image registration failed:', errorText);
                    throw new Error('Failed to register image upload');
                }

                const registerData = await registerResponse.json();
                const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
                const asset = registerData.value.asset;

                // Step 2: Fetch the image from URL
                const imageResponse = await fetch(imageUrl);
                if (!imageResponse.ok) {
                    throw new Error('Failed to fetch image from URL');
                }
                const imageBuffer = await imageResponse.arrayBuffer();

                // Step 3: Upload the image
                const uploadResponse = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/octet-stream'
                    },
                    body: imageBuffer
                });

                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    console.error('LinkedIn image upload failed:', errorText);
                    throw new Error('Failed to upload image');
                }

                // Step 4: Add image to post payload
                postPayload.specificContent['com.linkedin.ugc.ShareContent'].media = [{
                    status: 'READY',
                    description: {
                        text: 'Image'
                    },
                    media: asset,
                    title: {
                        text: 'Image'
                    }
                }];

            } catch (imageError) {
                console.error('Image upload error:', imageError);
                // Continue without image rather than failing the entire post
                postPayload.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'NONE';
            }
        }

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

            // Parse error for better user feedback
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

        // Success!
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
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
