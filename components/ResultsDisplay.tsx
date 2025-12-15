import React, { useState, useEffect } from "react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import LoaderIcon from "./icons/LoaderIcon";

// Interface for the generated content structure from the database
interface ContentGenerated {
  id: string;
  idx?: number;
  campaign_id: string;
  content_type: string;
  subtype: string;
  generated_text: string;
  metadata: any;
  created_at: string;
  user_id?: string;
}

// Props interface for the ResultsDisplay component
interface ResultsDisplayProps {
  campaignId: string;
  onStartOver: () => void;
}

interface CampaignData {
  name: string;
  platforms: {
    facebook?: boolean;
    instagram?: boolean;
    linkedin?: boolean;
    twitter?: boolean;
    gdrive?: boolean;
  };
}

interface ConnectedPlatform {
  platform: string;
  account_name?: string;
}

// Helper to check if a string looks like a UUID
const isLikelyUUID = (s: any) =>
  typeof s === "string" && s.length === 36 && s.includes("-");

/**
 * Helper function to extract platform name from social post titles
 */
const extractPlatformFromTitle = (title: string): string | null => {
  if (!title) return null;
  const match = title.match(/^(Twitter|LinkedIn|Instagram|Facebook|TikTok|YouTube)\s+(Post|Update|Content)/i);
  if (match) {
    return match[1];
  }
  return null;
};

/**
 * Map platform names to database platform identifiers
 */
const mapPlatformToDb = (platform: string): string => {
  const mapping: Record<string, string> = {
    'twitter': 'x',
    'facebook': 'facebook',
    'instagram': 'instagram',
    'linkedin': 'linkedin',
    'gdrive': 'google_drive'
  };
  return mapping[platform.toLowerCase()] || platform.toLowerCase();
};

/**
 * ResultsDisplay Component with Publishing Functionality
 */
const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  campaignId,
  onStartOver,
}) => {
  const { user } = useAuth();
  const [results, setResults] = useState<ContentGenerated[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [campaignData, setCampaignData] = useState<CampaignData>({ name: "", platforms: {} });
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);

  const toggleExpand = (i: number) => {
    setExpandedIndex(expandedIndex === i ? null : i);
  };

  // Load connected platforms
  useEffect(() => {
    const loadConnectedPlatforms = async () => {
      if (!user) return;

      console.log('[ResultsDisplay] Loading connected platforms for user:', user.id);

      const { data, error } = await supabase
        .from('social_credentials')
        .select('platform, account_name')
        .eq('user_id', user.id);

      if (error) {
        console.error('[ResultsDisplay] Error fetching connected platforms:', error);
        return;
      }

      if (data) {
        console.log('[ResultsDisplay] Connected platforms:', data.map((d: ConnectedPlatform) => d.platform));
        setConnectedPlatforms(data.map((d: ConnectedPlatform) => d.platform));
      }
    };

    loadConnectedPlatforms();
  }, [user]);

  // Load campaign results and details
  useEffect(() => {
    const loadResults = async () => {
      console.log("🔍 [ResultsDisplay] start loadResults, campaignId:", campaignId);

      setIsLoading(true);

      if (!campaignId || !isLikelyUUID(campaignId)) {
        console.warn("⚠️ [ResultsDisplay] Invalid campaignId");
        setResults([]);
        setIsLoading(false);
        return;
      }

      try {
        // Fetch Campaign Data (name + platforms)
        const { data: campaign, error: campaignError } = await supabase
          .from("form_idea")
          .select("name, platforms")
          .eq("id", campaignId)
          .single();

        if (campaign) {
          setCampaignData({
            name: campaign.name,
            platforms: typeof campaign.platforms === 'string'
              ? JSON.parse(campaign.platforms)
              : campaign.platforms || {}
          });
        } else if (campaignError) {
          console.warn("⚠️ [ResultsDisplay] Failed to fetch campaign:", campaignError);
        }

        // Fetch Generated Content
        const { data, error } = await supabase
          .from("generated_content")
          .select("*")
          .eq("campaign_id", campaignId);

        const cleaned = (data || []).map((item: any) => {
          let metadata = item.metadata;
          if (typeof metadata === "string") {
            try {
              metadata = JSON.parse(metadata);
            } catch {
              metadata = {};
            }
          }

          // Handle composite subtype (JSON string stored in text column)
          let subtype = item.subtype;
          let platformFromSubtype = null;

          if (subtype && subtype.startsWith('{') && subtype.endsWith('}')) {
            try {
              const parsedSubtype = JSON.parse(subtype);
              subtype = parsedSubtype.original_subtype;
              platformFromSubtype = parsedSubtype.platform;
            } catch (e) {
              // Not JSON, assume legacy string
            }
          }

          // Merge platform found in subtype into metadata for consistency
          if (platformFromSubtype) {
            metadata = { ...metadata, platform: platformFromSubtype };
          }

          return {
            ...item,
            subtype,
            metadata: metadata ?? {}
          };
        });

        setResults(cleaned);
        setIsLoading(false);
      } catch (err) {
        console.error("❌ query failed:", err);
        setResults([]);
        setIsLoading(false);
      }
    };

    loadResults();
  }, [campaignId]);

  // Handle publishing to a platform
  const handlePublish = async (item: ContentGenerated, platform: string) => {
    setPublishing(item.id + platform);

    try {
      console.log(`[Publishing] to ${platform}:`, {
        text: item.generated_text,
        image: item.metadata?.generated_image_url
      });

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get access token for the platform
      const dbPlatform = mapPlatformToDb(platform);
      console.log(`[Publishing] Looking for credentials: user_id=${user.id}, platform=${dbPlatform}`);

      const { data: credentials, error: credError } = await supabase
        .from('social_credentials')
        .select('access_token, account_id, account_name')
        .eq('user_id', user.id)
        .eq('platform', dbPlatform)
        .single();

      if (credError || !credentials) {
        throw new Error(`No credentials found for ${platform}. Please reconnect your account.`);
      }

      console.log(`[Publishing] Found credentials for ${platform}:`, {
        hasToken: !!credentials.access_token,
        accountName: credentials.account_name
      });

      // Publish based on platform
      if (platform.toLowerCase() === 'facebook') {
        await publishToFacebook(
          item.generated_text,
          item.metadata?.generated_image_url,
          credentials.access_token,
          credentials.account_id
        );
      } else if (platform.toLowerCase() === 'twitter' || platform.toLowerCase() === 'x') {
        await publishToTwitter(
          item.generated_text,
          item.metadata?.generated_image_url,
          credentials.access_token
        );
      } else if (platform.toLowerCase() === 'instagram') {
        await publishToInstagram(
          item.generated_text,
          item.metadata?.generated_image_url,
          credentials.access_token,
          credentials.account_id
        );
      } else if (platform.toLowerCase() === 'linkedin') {
        await publishToLinkedIn(
          item.generated_text,
          item.metadata?.generated_image_url,
          credentials.access_token
        );
      } else {
        throw new Error(`Publishing to ${platform} is not yet implemented`);
      }

      alert(`✅ Successfully published to ${platform}!`);

    } catch (err: any) {
      console.error(`Error publishing to ${platform}:`, err);
      alert(`❌ Failed to publish to ${platform}: ${err.message}`);
    } finally {
      setPublishing(null);
    }
  };

  // Facebook Publishing
  const publishToFacebook = async (
    text: string,
    imageUrl: string | undefined,
    accessToken: string,
    pageId?: string
  ) => {
    console.log('[Facebook] Publishing post...');

    // Get user's pages with their access tokens
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error('[Facebook] Error fetching pages:', pagesData.error);
      throw new Error(pagesData.error.message || 'Failed to fetch Facebook pages');
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('No Facebook pages found. Please create a page or check your permissions.');
    }

    // Use the first page (or find by pageId if provided)
    let targetPage = pagesData.data[0];
    if (pageId) {
      const foundPage = pagesData.data.find((p: any) => p.id === pageId);
      if (foundPage) targetPage = foundPage;
    }

    console.log('[Facebook] Publishing to page:', targetPage.name);

    const pageAccessToken = targetPage.access_token;
    let endpoint = '';
    let postData: any = { access_token: pageAccessToken };

    // DECIDE ENDPOINT: Photos vs Feed
    if (imageUrl) {
      // Post as Photo
      console.log('[Facebook] Posting as Photo');
      endpoint = `https://graph.facebook.com/v18.0/${targetPage.id}/photos`;
      postData.url = imageUrl;
      postData.caption = text;
    } else {
      // Post as Text (Status Update)
      console.log('[Facebook] Posting as Status Update');
      endpoint = `https://graph.facebook.com/v18.0/${targetPage.id}/feed`;
      postData.message = text;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Facebook] API Error:', result);
      throw new Error(result.error?.message || 'Failed to publish to Facebook');
    }

    console.log('[Facebook] Published successfully:', result);
    return result;
  };

  // Twitter Publishing with Native Image Upload
  const publishToTwitter = async (
    text: string,
    imageUrl: string | undefined,
    accessToken: string
  ) => {
    console.log('[Twitter] Publishing tweet...');

    if (!user) {
      throw new Error('User not authenticated');
    }

    // Call our Twitter API endpoint
    const response = await fetch('/api/twitter/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user.id,
        text: text,
        imageUrl: imageUrl
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Twitter] API Error:', data);
      throw new Error(data.error || 'Failed to post to Twitter');
    }

    console.log('[Twitter] Published successfully:', data);
    return data;
  };

  // Instagram Publishing (placeholder)
  // Instagram Publishing
  const publishToInstagram = async (
    text: string,
    imageUrl: string | undefined,
    accessToken: string,
    accountId?: string
  ) => {
    if (!imageUrl) {
      throw new Error("Instagram requires an image to publish.");
    }

    // 1. Find the Instagram Business Account ID
    // We need to fetch the user's pages and see which one has a connected IG account
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=instagram_business_account,access_token&access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      throw new Error(`FB API Error: ${pagesData.error.message}`);
    }

    // Find the first page with a connected Instagram account
    const pageWithIg = pagesData.data.find((p: any) => p.instagram_business_account);

    if (!pageWithIg) {
      throw new Error("No Instagram Business Account found linked to your Facebook Pages. Please link your Instagram to a Facebook Page.");
    }

    const igUserId = pageWithIg.instagram_business_account.id;
    // Note: We can use the Page Access Token or the User Access Token (if it has permissions)
    // Usually, for IG publishing, we use the Page Access Token of the linked page
    const pageAccessToken = pageWithIg.access_token;

    console.log(`[Instagram] Found IG Account: ${igUserId}`);

    // 2. Create Media Container
    const containerUrl = `https://graph.facebook.com/v18.0/${igUserId}/media`;
    const containerParams = new URLSearchParams({
      image_url: imageUrl,
      caption: text,
      access_token: pageAccessToken
    });

    const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
      method: 'POST'
    });
    const containerData = await containerResponse.json();

    if (containerData.error) {
      throw new Error(`IG Container Error: ${containerData.error.message}`);
    }

    const creationId = containerData.id;
    console.log(`[Instagram] Container created: ${creationId}`);

    // 3. Publish Media Container
    const publishUrl = `https://graph.facebook.com/v18.0/${igUserId}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: pageAccessToken
    });

    const publishResponse = await fetch(`${publishUrl}?${publishParams}`, {
      method: 'POST'
    });
    const publishData = await publishResponse.json();

    if (publishData.error) {
      throw new Error(`IG Publish Error: ${publishData.error.message}`);
    }

    return publishData;
  };

  // LinkedIn Publishing
  const publishToLinkedIn = async (
    text: string,
    imageUrl: string | undefined,
    accessToken: string
  ) => {
    console.log('[LinkedIn] Publishing post...');

    if (!user) {
      throw new Error('User not authenticated');
    }

    // Call our LinkedIn API endpoint
    const response = await fetch('/api/linkedin/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user.id,
        text: text,
        imageUrl: imageUrl
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[LinkedIn] API Error:', data);
      throw new Error(data.error || 'Failed to post to LinkedIn');
    }

    console.log('[LinkedIn] Published successfully:', data);
    return data;
  };

  // Save entire campaign to Google Drive
  const handleSaveToDrive = async () => {
    setIsSavingToDrive(true);
    try {
      console.log('[Google Drive] Starting save process...');

      // 1. Get User & Credentials
      if (!user) throw new Error('User not authenticated');

      const { data: credentials, error: credError } = await supabase
        .from('social_credentials')
        .select('access_token')
        .eq('user_id', user.id)
        .eq('platform', 'google_drive')
        .single();

      if (credError || !credentials) {
        throw new Error('Google Drive not connected. Please connect in Social Connections.');
      }

      // 2. Compile Content into HTML
      let htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              h1 { color: #1a1a1a; border-bottom: 2px solid #eee; padding-bottom: 10px; }
              h2 { color: #2c3e50; margin-top: 30px; }
              .meta { color: #666; font-size: 0.9em; margin-bottom: 15px; }
              .content-box { background: #f9f9f9; padding: 15px; border-radius: 5px; border: 1px solid #eee; }
              img { max-width: 100%; height: auto; margin: 20px 0; border: 1px solid #ddd; border-radius: 4px; }
            </style>
          </head>
          <body>
            <h1>Generated Content for Campaign: ${campaignData.name || 'Untitled Campaign'}</h1>
            <p><strong>Date Generated:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Total Items:</strong> ${results.length}</p>
            <hr />
      `;

      results.forEach((item, index) => {
        const title = item.metadata?.title || `Content Item #${index + 1}`;
        const type = item.content_type?.toUpperCase() || 'UNKNOWN';
        const platform = extractPlatformFromTitle(item.metadata?.title, item.subtype) || 'General';

        htmlContent += `
          <div class="item">
            <h2>${index + 1}. ${title}</h2>
            <div class="meta">
              <strong>Type:</strong> ${type} | <strong>Platform:</strong> ${platform}
            </div>
            
            <div class="content-box">
              ${item.generated_text.replace(/\n/g, '<br/>')}
            </div>
        `;

        if (item.metadata?.generated_image_url) {
          htmlContent += `
            <div class="image-container">
              <p><strong>Generated Visual:</strong></p>
              <img src="${item.metadata.generated_image_url}" alt="${title}" width="600" />
            </div>
          `;
        }

        htmlContent += `
            <br/><hr/>
          </div>
        `;
      });

      htmlContent += `
          </body>
        </html>
      `;

      // 3. Prepare Multipart Upload
      const metadata = {
        name: `Campaign Content - ${campaignData.name || 'Untitled'}`,
        mimeType: 'application/vnd.google-apps.document',
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/html\r\n\r\n' +
        htmlContent +
        closeDelim;

      // 4. Upload to Drive
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[Google Drive] API Error:', errorData);
        throw new Error(errorData.error?.message || 'Failed to upload to Drive');
      }

      const fileData = await response.json();
      console.log('[Google Drive] File created:', fileData);

      alert(`✅ Successfully saved to Google Drive!\nFile: "${metadata.name}"`);

    } catch (err: any) {
      console.error('[Google Drive] Error:', err);
      alert(`❌ Failed to save to Drive: ${err.message}`);
    } finally {
      setIsSavingToDrive(false);
    }
  };

  // Helper to extract platform from title or subtype
  const extractPlatformFromTitle = (title: string, subtype?: string): string | null => {
    // Check subtype first
    if (subtype) {
      const s = subtype.toLowerCase();
      if (s.includes('facebook')) return 'Facebook';
      if (s.includes('twitter') || s.includes('tweet') || s.includes('x_')) return 'Twitter';
      if (s.includes('instagram')) return 'Instagram';
      if (s.includes('linkedin')) return 'LinkedIn';
    }

    if (!title) return null;
    const match = title.match(/(Twitter|LinkedIn|Instagram|Facebook|TikTok|YouTube)/i);
    if (match) {
      return match[1];
    }
    return null;
  };

  // Get platforms for a specific content item
  const getPlatformsForContent = (item: ContentGenerated): string[] => {
    // 1. If it's NOT a social post, do NOT show social publishing options
    //    (Blogs, Webpages, Emails, etc. generally go to CMS or Email tools, not FB/Twitter directly)
    //    Accept 'social' OR 'social_post' to handle variations in AI output or legacy data
    if (item.content_type !== 'social_post' && item.content_type !== 'social') {
      return [];
    }

    // 2. Try to detect specific platform for this content item
    //    Check 'item.platform' first (if it exists in your interface/DB data), then fall back to title/subtype
    const explicitPlatform = (item as any).platform || item.metadata?.platform || item.subtype;
    const detected = extractPlatformFromTitle(item.metadata?.title, explicitPlatform);

    if (detected) {
      const detectedDb = mapPlatformToDb(detected);
      // If the content is specifically for a platform (e.g. "Twitter Post"),
      // ONLY show that platform's button.
      return [detectedDb];
    }

    // 3. If content is generic social post (no specific platform detected), 
    //    allow publishing to ANY of the campaign's selected social platforms.
    const campaignPlatforms: string[] = [];
    if (campaignData.platforms) {
      Object.entries(campaignData.platforms).forEach(([key, value]) => {
        if (value && key !== 'gdrive') { // Exclude gdrive from social buttons
          campaignPlatforms.push(key);
        }
      });
    }

    return campaignPlatforms;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LoaderIcon className="h-12 w-12 text-primary" />
        <h3 className="text-xl font-bold text-foreground mt-6">
          Loading Content Results
        </h3>
        <p className="text-muted-foreground mt-2 text-base">
          Fetching generated content for this campaign...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {campaignData.name || "Generated Content"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? 'item' : 'items'} generated by AI
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Google Drive Button */}
          {connectedPlatforms.includes('google_drive') ? (
            <button
              onClick={handleSaveToDrive}
              className="inline-flex items-center justify-center rounded-lg bg-[#1DA462] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1DA462]/90 transition-all duration-200"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.01 1.9c-1.1 0-2.1.5-2.6 1.4L3.2 14.5c-.5.9-.5 1.9 0 2.8l6.2 10.8c.5.9 1.5 1.4 2.6 1.4h12.4c1.1 0 2.1-.5 2.6-1.4l6.2-10.8c.5-.9.5-1.9 0-2.8L26.6 3.3c-.5-.9-1.5-1.4-2.6-1.4H12.01zm0 3h11.5l-5.8 10-5.7-10zM5.5 15.5h11.5l5.7 10h-11.5l-5.7-10zm13.5 0l5.8 10H13.2l-5.7-10h11.5z" transform="scale(0.75) translate(4,4)" />
              </svg>
              Save to Drive
            </button>
          ) : (
            <button
              onClick={onStartOver}
              className="inline-flex items-center justify-center rounded-lg border border-[#1DA462] text-[#1DA462] px-5 py-2.5 text-sm font-semibold bg-transparent hover:bg-[#1DA462]/10 transition-all duration-200"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.01 1.9c-1.1 0-2.1.5-2.6 1.4L3.2 14.5c-.5.9-.5 1.9 0 2.8l6.2 10.8c.5.9 1.5 1.4 2.6 1.4h12.4c1.1 0 2.1-.5 2.6-1.4l6.2-10.8c.5-.9.5-1.9 0-2.8L26.6 3.3c-.5-.9-1.5-1.4-2.6-1.4H12.01zm0 3h11.5l-5.8 10-5.7-10zM5.5 15.5h11.5l5.7 10h-11.5l-5.7-10zm13.5 0l5.8 10H13.2l-5.7-10h11.5z" transform="scale(0.75) translate(4,4)" />
              </svg>
              Connect Drive
            </button>
          )}

          <button
            onClick={onStartOver}
            className="inline-flex items-center justify-center rounded-lg bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-muted hover:ring-primary/50 transition-all duration-200"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Content Cards List */}
      <div className="space-y-8">
        {results.map((item, index) => {
          const contentPlatforms = getPlatformsForContent(item);

          return (
            <div key={item.id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">

              {/* 1. Main Content Area (Always Visible) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:gap-6">

                {/* Left Column: Content Preview */}
                <div className="col-span-2 p-6 border-b lg:border-b-0 lg:border-r border-border">
                  <div className="flex items-center justify-between mb-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {item.content_type?.toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-foreground mb-4">
                    {item.metadata?.title ||
                      (item.metadata?.platform
                        ? `${item.metadata.platform} Post`
                        : (item.subtype ? `${item.subtype.charAt(0).toUpperCase() + item.subtype.slice(1)}` : "Untitled Content"))
                    }
                  </h3>

                  {/* Image Preview */}
                  {item.metadata?.generated_image_url && (
                    <div className="mb-4 rounded-lg overflow-hidden border border-border bg-muted/30">
                      <img
                        src={item.metadata.generated_image_url}
                        className="w-full h-auto max-h-[300px] object-contain"
                        alt="Generated visual"
                      />
                    </div>
                  )}

                  {/* Text Preview */}
                  <div className="bg-muted/30 rounded-lg p-4 border border-border">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {item.generated_text}
                    </p>
                  </div>
                </div>

                {/* Right Column: Publishing Controls (Always Visible) */}
                <div className="col-span-1 bg-muted/10 p-6 flex flex-col">
                  <h4 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    {contentPlatforms.length === 1
                      ? `Publish to ${contentPlatforms[0].charAt(0).toUpperCase() + contentPlatforms[0].slice(1)}`
                      : "Publish to Campaign Platforms"
                    }
                  </h4>

                  <div className="space-y-3 flex-1">
                    {contentPlatforms.map((platform) => {
                      const dbPlatform = mapPlatformToDb(platform);
                      const isConnected = connectedPlatforms.includes(dbPlatform);
                      const isPublishing = publishing === item.id + platform;

                      return (
                        <div
                          key={platform}
                          className={`p-3 rounded-lg border transition-all ${isConnected
                            ? 'bg-card border-border shadow-sm'
                            : 'bg-muted/30 border-dashed border-muted-foreground/30'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium capitalize flex items-center gap-2">
                              {platform}
                              {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                            </span>
                          </div>

                          {isConnected ? (
                            <button
                              onClick={() => handlePublish(item, platform)}
                              disabled={isPublishing}
                              className="w-full inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {isPublishing ? (
                                <>
                                  <LoaderIcon className="h-3.5 w-3.5 mr-2" />
                                  Publishing...
                                </>
                              ) : (
                                'Publish Now'
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={onStartOver}
                              className="w-full text-xs text-muted-foreground hover:text-primary hover:underline text-left"
                            >
                              Connect Account →
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* View Details Toggle */}
                  <button
                    onClick={() => toggleExpand(index)}
                    className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 border-t border-border"
                  >
                    {expandedIndex === index ? 'Hide Details' : 'View Metadata & Details'}
                    <svg
                      className={`h-4 w-4 transition-transform duration-200 ${expandedIndex === index ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 2. Expanded Details Section (Metadata Only) */}
              {expandedIndex === index && (
                <div className="bg-muted/20 border-t border-border p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Metadata */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Metadata
                      </h4>
                      <div className="bg-card p-4 rounded-lg border border-border space-y-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-muted-foreground">Title</span>
                          <span className="text-sm text-foreground">{item.metadata?.title || "Untitled"}</span>
                        </div>
                        {item.metadata?.keywords && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">Keywords</span>
                            <div className="flex flex-wrap gap-1">
                              {item.metadata.keywords.map((k: string, i: number) => (
                                <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{k}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Raw Data / Debug */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        System Info
                      </h4>
                      <div className="bg-card p-4 rounded-lg border border-border text-xs text-muted-foreground font-mono">
                        <p>ID: {item.id}</p>
                        <p>Type: {item.content_type} / {item.subtype}</p>
                        <p>Created: {item.created_at}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {results.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-muted-foreground text-lg font-medium">
            No generated content found for this campaign.
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            Start generating content to see results here.
          </p>
        </div>
      )}

      {/* Loading Overlay for Drive Save */}
      {isSavingToDrive && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card p-8 rounded-xl shadow-lg border border-border max-w-md w-full text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              {/* Spinner */}
              <div className="absolute inset-0 border-4 border-muted rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-[#1DA462] rounded-full animate-spin"></div>
              {/* Drive Icon in Center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#1DA462]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.01 1.9c-1.1 0-2.1.5-2.6 1.4L3.2 14.5c-.5.9-.5 1.9 0 2.8l6.2 10.8c.5.9 1.5 1.4 2.6 1.4h12.4c1.1 0 2.1-.5 2.6-1.4l6.2-10.8c.5-.9.5-1.9 0-2.8L26.6 3.3c-.5-.9-1.5-1.4-2.6-1.4H12.01zm0 3h11.5l-5.8 10-5.7-10zM5.5 15.5h11.5l5.7 10h-11.5l-5.7-10zm13.5 0l5.8 10H13.2l-5.7-10h11.5z" transform="scale(0.75) translate(4,4)" />
                </svg>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-foreground">Saving to Google Drive</h3>
              <p className="text-muted-foreground">
                Compiling your campaign content into a Google Doc...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsDisplay;
