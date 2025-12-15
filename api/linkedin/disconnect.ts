import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * LinkedIn Disconnect Endpoint
 * 
 * Removes LinkedIn connection by deleting stored credentials from the database.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'Missing required field: userId'
            });
        }

        // Initialize Supabase client
        const supabase = createClient(
            process.env.VITE_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Delete LinkedIn credentials from database
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

        // Success
        res.status(200).json({
            success: true,
            message: 'LinkedIn account disconnected successfully'
        });

    } catch (error) {
        console.error('LinkedIn disconnect error:', error);
        res.status(500).json({
            error: 'Failed to disconnect LinkedIn account',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
