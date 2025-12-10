import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../hooks/useAuth';

interface SocialPlatform {
    id: string;
    name: string;
    description: string;
    iconPath: string;
    color: string;
    dbPlatform: 'google_drive' | 'facebook' | 'instagram' | 'linkedin' | 'x';
    provider: 'google' | 'facebook' | 'twitter' | 'linkedin';
    scopes: string;
}

const platforms: SocialPlatform[] = [
    {
        id: 'gdrive',
        name: 'Google Drive',
        description: 'Save content directly to your Drive',
        color: '#1DA462',
        iconPath: 'M12.01 1.9c-1.1 0-2.1.5-2.6 1.4L3.2 14.5c-.5.9-.5 1.9 0 2.8l6.2 10.8c.5.9 1.5 1.4 2.6 1.4h12.4c1.1 0 2.1-.5 2.6-1.4l6.2-10.8c.5-.9.5-1.9 0-2.8L26.6 3.3c-.5-.9-1.5-1.4-2.6-1.4H12.01zm0 3h11.5l-5.8 10-5.7-10zM5.5 15.5h11.5l5.7 10h-11.5l-5.7-10zm13.5 0l5.8 10H13.2l-5.7-10h11.5z',
        dbPlatform: 'google_drive',
        provider: 'google',
        scopes: 'https://www.googleapis.com/auth/drive.file'
    },
    {
        id: 'facebook',
        name: 'Facebook',
        description: 'Publish posts to your Pages',
        color: '#1877F2',
        iconPath: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
        dbPlatform: 'facebook',
        provider: 'facebook',
        scopes: 'pages_show_list,pages_manage_posts,pages_read_engagement'
    },
    {
        id: 'instagram',
        name: 'Instagram',
        description: 'Share photos and reels',
        color: '#E4405F',
        iconPath: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.069-4.85.069-3.204 0-3.584-.012-4.849-.069-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
        dbPlatform: 'instagram',
        provider: 'facebook',
        scopes: 'instagram_basic,instagram_content_publish,pages_show_list'
    },
    {
        id: 'twitter',
        name: 'X (Twitter)',
        description: 'Post tweets and threads',
        color: '#000000',
        iconPath: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
        dbPlatform: 'x',
        provider: 'twitter',
        scopes: 'tweet.read,tweet.write,users.read'
    },
    {
        id: 'linkedin',
        name: 'LinkedIn',
        description: 'Share professional updates',
        color: '#0A66C2',
        iconPath: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
        dbPlatform: 'linkedin',
        provider: 'linkedin',
        scopes: 'w_member_social,r_liteprofile'
    }
];

// PKCE Helpers
const generateCodeVerifier = () => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
};

const generateCodeChallenge = async (verifier: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

const SocialConnections: React.FC = () => {
    const { user } = useAuth();
    const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
    const [loading, setLoading] = useState<string | null>(null);

    const checkConnections = async () => {
        if (!user) return;

        const { data, error } = await supabase
            .from('social_credentials')
            .select('platform')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error fetching connections:', error);
            return;
        }

        if (data) {
            setConnectedPlatforms(data.map((d: any) => d.platform));
        }
    };

    const handleAuthCallback = async (session: any) => {
        try {
            if (!user) {
                throw new Error('No active user session found');
            }

            console.log('[handleAuthCallback] Received session:', {
                hasUser: !!session.user,
                hasProviderToken: !!session.provider_token,
                provider: session.user?.app_metadata?.provider,
                mainUserId: user.id
            });

            const { provider_token, provider_refresh_token, expires_in } = session;

            if (!provider_token) {
                console.error('[handleAuthCallback] No provider_token in session!');
                alert('Authentication succeeded but no access token was provided. Please try again.');
                return;
            }

            // Use session user metadata to identify provider
            const provider = session.user.app_metadata.provider;

            const intendedPlatform = localStorage.getItem('connecting_platform');
            console.log('[handleAuthCallback] Intended platform:', intendedPlatform);

            const platformConfig = platforms.find(p => p.id === intendedPlatform) ||
                platforms.find(p => p.provider === provider);

            if (!platformConfig) {
                console.error('Could not identify platform for provider:', provider);
                alert(`Could not identify platform for provider: ${provider}`);
                return;
            }

            console.log('[handleAuthCallback] Saving to database:', {
                platform: platformConfig.dbPlatform,
                user_id: user.id,
                hasToken: !!provider_token
            });

            const expiresAt = expires_in
                ? new Date(Date.now() + expires_in * 1000).toISOString()
                : null;

            const credentialData = {
                user_id: user.id,
                platform: platformConfig.dbPlatform,
                access_token: provider_token,
                refresh_token: provider_refresh_token || null,
                token_type: 'bearer',
                expires_at: expiresAt,
                scopes: platformConfig.scopes.split(','),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabase
                .from('social_credentials')
                .upsert(credentialData, {
                    onConflict: 'user_id,platform',
                    ignoreDuplicates: false
                })
                .select();

            if (error) {
                console.error('[handleAuthCallback] Database error:', error);
                if (error.code === '23503') {
                    alert('Session Error: Your account record is missing from the database. Please Log Out and Sign Up again to fix this.');
                } else {
                    throw error;
                }
                return;
            }

            console.log('[handleAuthCallback] Successfully saved to database:', data);
            console.log(`✅ Successfully connected ${platformConfig.name}`);

            localStorage.removeItem('connecting_platform');
            await checkConnections();

        } catch (err: any) {
            console.error('[handleAuthCallback] Error saving credentials:', err);
            alert(`Failed to save connection: ${err.message || 'Unknown error'}`);
        }
    };

    const handleTwitterCallback = async (data: any) => {
        try {
            if (!user) {
                throw new Error('No active user session. Please log in again.');
            }

            console.log('[Twitter Callback] Current User ID:', user.id);

            const credentialData = {
                user_id: user.id,
                platform: 'x',
                access_token: data.access_token,
                refresh_token: data.refresh_token || null,
                token_type: data.token_type || 'bearer',
                expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
                scopes: data.scope ? data.scope.split(' ') : [],
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('social_credentials')
                .upsert(credentialData, { onConflict: 'user_id,platform' });

            if (error) {
                if (error.code === '23503') {
                    alert('Session Error: Your account record is missing from the database. Please Log Out and Sign Up again to fix this.');
                } else {
                    throw error;
                }
                return;
            }

            console.log('✅ Successfully connected X (Twitter)!');
            localStorage.removeItem('connecting_platform');
            await checkConnections();

        } catch (err: any) {
            console.error('Twitter Save Error:', err);
            alert('Failed to save Twitter connection: ' + err.message);
        }
    };

    useEffect(() => {
        if (user) {
            checkConnections();
        }

        // Listen for messages from popup window
        const handleMessage = async (event: MessageEvent) => {
            // Verify origin for security
            if (event.origin !== window.location.origin) return;

            if (event.data.type === 'OAUTH_SUCCESS') {
                console.log('[SocialConnections] OAuth success received from popup');
                await handleAuthCallback(event.data.session);
                setLoading(null);
            } else if (event.data.type === 'OAUTH_ERROR') {
                console.error('[SocialConnections] OAuth error:', event.data.error);
                alert('Authentication failed. Please try again.');
                setLoading(null);
            } else if (event.data.type === 'TWITTER_OAUTH_SUCCESS') {
                console.log('[SocialConnections] Twitter OAuth success received');
                await handleTwitterCallback(event.data.data);
                setLoading(null);
            }
        };



        
        // Check for OAuth success in localStorage (tab mode fallback)
        const checkLocalStorageAuth = async () => {
            const oauthSuccess = localStorage.getItem('oauth_success');
            const oauthSession = localStorage.getItem('oauth_session');
            const oauthTimestamp = localStorage.getItem('oauth_timestamp');

            if (oauthSuccess === 'true' && oauthSession) {
                // Check if this is recent (within last 30 seconds)
                const timestamp = parseInt(oauthTimestamp || '0');
                const now = Date.now();

                if (now - timestamp < 30000) {
                    console.log('[SocialConnections] Found recent OAuth success in localStorage');
                    try {
                        const session = JSON.parse(oauthSession);
                        await handleAuthCallback(session);
                    } catch (e) {
                        console.error('Error parsing session from localStorage', e);
                    }
                }

                // Clear flags
                localStorage.removeItem('oauth_success');
                localStorage.removeItem('oauth_session');
                localStorage.removeItem('oauth_timestamp');
            }
        };

        // Check immediately on mount
        checkLocalStorageAuth();

        // Also check when tab becomes visible (user returns from OAuth tab)
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                console.log('[SocialConnections] Tab visible, checking for OAuth completion');
                checkLocalStorageAuth();
            }
        };

        window.addEventListener('message', handleMessage);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Poll localStorage every 2 seconds as backup
        const pollInterval = setInterval(checkLocalStorageAuth, 2000);

        return () => {
            window.removeEventListener('message', handleMessage);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(pollInterval);
        };
    }, [user]);

    const handleTwitterConnect = async () => {
        const clientId = (import.meta as any).env.VITE_TWITTER_CLIENT_ID;
        if (!clientId) {
            alert('Twitter Client ID not found. Please add VITE_TWITTER_CLIENT_ID to your .env.local file.');
            setLoading(null);
            return;
        }

        const redirectUri = `${window.location.origin}/twitter-callback.html`;
        console.log('[Twitter] Using Redirect URI:', redirectUri); // Debugging
        const state = Math.random().toString(36).substring(7);
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Store for callback
        localStorage.setItem('twitter_state', state);
        localStorage.setItem('twitter_code_verifier', codeVerifier);
        localStorage.setItem('twitter_client_id', clientId);
        localStorage.setItem('twitter_redirect_uri', redirectUri);
        localStorage.setItem('connecting_platform', 'twitter');

        // Build URL
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: 'tweet.read tweet.write users.read offline.access',
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

        // Open Popup
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
            authUrl,
            'Twitter Auth',
            `width=${width},height=${height},left=${left},top=${top}`
        );

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            alert('Popup was blocked. Please allow popups for this site.');
            setLoading(null);
        }
    };

    const handleConnect = async (platform: SocialPlatform) => {
        if (platform.id === 'twitter') {
            setLoading(platform.id);
            await handleTwitterConnect();
            return;
        }

        try {
            setLoading(platform.id);
            localStorage.setItem('connecting_platform', platform.id);

            // Create a callback page URL
            const callbackUrl = `${window.location.origin}/auth-callback.html`;

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: platform.provider,
                options: {
                    scopes: platform.scopes,
                    redirectTo: callbackUrl,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                },
            });

            if (error) throw error;

            // Open OAuth URL in popup
            if (data?.url) {
                const width = 600;
                const height = 700;
                const left = window.screen.width / 2 - width / 2;
                const top = window.screen.height / 2 - height / 2;

                const popup = window.open(
                    data.url,
                    `${platform.name} Authentication`,
                    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
                );

                // Check if popup was blocked
                if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                    console.log('[handleConnect] Popup blocked, opening in new tab');

                    // Popup was blocked - open in new tab instead
                    const newTab = window.open(data.url, '_blank');

                    if (!newTab) {
                        // Even new tab was blocked - show instructions
                        alert(
                            `Please allow popups for this site to connect your ${platform.name} account.\n\n` +
                            `Look for the popup blocked icon (🚫) in your address bar and click "Always allow popups from localhost:3000"`
                        );
                        setLoading(null);
                        localStorage.removeItem('connecting_platform');
                    } else {
                        // New tab opened successfully
                        console.log('[handleConnect] Opened in new tab - waiting for OAuth completion');
                    }
                } else {
                    console.log('[handleConnect] Popup opened successfully');
                }
            }

        } catch (err) {
            console.error('Error initiating connection:', err);
            alert(`Failed to connect to ${platform.name}`);
            setLoading(null);
            localStorage.removeItem('connecting_platform');
        }
    };

    const handleDisconnect = async (platform: SocialPlatform) => {
        if (!confirm(`Are you sure you want to disconnect ${platform.name}?`)) return;

        try {
            if (!user) return;

            const { error } = await supabase
                .from('social_credentials')
                .delete()
                .match({ user_id: user.id, platform: platform.dbPlatform });

            if (error) throw error;

            await checkConnections();
        } catch (err) {
            console.error('Error disconnecting:', err);
            alert('Failed to disconnect.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Social Connections</h2>
                <p className="text-muted-foreground">
                    Connect your accounts to publish content directly from the dashboard.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {platforms.map((platform) => {
                    const isConnected = connectedPlatforms.includes(platform.dbPlatform);

                    return (
                        <div
                            key={platform.id}
                            className={`group relative overflow-hidden rounded-xl border p-6 shadow-sm transition-all hover:shadow-md ${isConnected ? 'bg-primary/5 border-primary/20' : 'bg-card hover:border-primary/50'
                                }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center space-x-4">
                                    <div
                                        className="flex h-12 w-12 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-white"
                                        style={{ color: platform.color }}
                                    >
                                        <svg
                                            viewBox={platform.id === 'gdrive' ? "0 0 32 32" : "0 0 24 24"}
                                            fill="currentColor"
                                            className="h-6 w-6"
                                        >
                                            <path d={platform.iconPath} />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold leading-none tracking-tight">{platform.name}</h3>
                                        <p className="text-sm text-muted-foreground mt-1">{platform.description}</p>
                                    </div>
                                </div>
                                {isConnected && (
                                    <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                                )}
                            </div>

                            <div className="mt-6">
                                {isConnected ? (
                                    <button
                                        onClick={() => handleDisconnect(platform)}
                                        className="w-full inline-flex items-center justify-center rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                    >
                                        disconnect
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleConnect(platform)}
                                        disabled={loading === platform.id}
                                        className="w-full inline-flex items-center justify-center rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading === platform.id ? 'Connecting...' : 'Connect'}
                                    </button>
                                )}
                            </div>

                            {/* Decorative gradient background on hover */}
                            <div
                                className="absolute inset-0 -z-10 opacity-0 transition-opacity group-hover:opacity-5 bg-gradient-to-br from-primary to-transparent"
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SocialConnections;
