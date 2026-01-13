import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { signOut } from '../services/authService';
import LoaderIcon from './icons/LoaderIcon';
import SocialConnections from './SocialConnections';

// Props interface for the Dashboard component
interface DashboardProps {
  onStartCampaign: (campaignId: string | number | null) => void;
}

// Interface representing a campaign/idea from the form_idea table
interface IdeaForm {
  id: string;
  user_id: string;
  name: string;
  idea: string;
  brand_voice: string;
  content_types: any;
  webpage_types: any;
  platforms: any;
  needs_images: boolean;
  image_for: any;
  mode: "auto" | "review";
  created_at: string;
}

/**
 * Dashboard Component
 * 
 * Displays a list of user's campaigns and allows creating new ones.
 * Handles fetching campaigns from Supabase and managing the list state.
 */
const Dashboard: React.FC<DashboardProps> = ({ onStartCampaign }) => {
  const { user } = useAuth();

  // State for storing the list of campaigns
  const [campaigns, setCampaigns] = useState<IdeaForm[]>([]);
  // State for loading status
  const [loading, setLoading] = useState(true);
  // State to track which dropdown menu is currently open (by campaign ID)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // State for active tab
  const [activeTab, setActiveTab] = useState<'campaigns' | 'social'>('campaigns');

  // State for delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<{ id: string; name: string } | null>(null);

  // Refs to track previous campaigns for comparison and component mount status
  const previousCampaignsRef = useRef<IdeaForm[] | null>(null);
  const mountedRef = useRef(true);

  // Effect to handle component mount/unmount status
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Effect to fetch campaigns when user ID changes
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setCampaigns([]);
      return;
    }

    const fetchCampaigns = async () => {
      if (!mountedRef.current) return;

      try {
        console.log('[Dashboard] Fetching ideas for user:', user.id);

        // Fetch campaigns from form_idea table for the current user
        const { data, error } = await supabase
          .from('form_idea')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const newCampaigns = data || [];

        // Compare with previous campaigns to avoid unnecessary state updates
        const prevIds = JSON.stringify(previousCampaignsRef.current?.map(c => c.id).sort());
        const newIds = JSON.stringify(newCampaigns.map(c => c.id).sort());

        if (prevIds !== newIds) {
          previousCampaignsRef.current = newCampaigns;
          setCampaigns(newCampaigns);
        }
      } catch (err) {
        console.error('Error fetching campaigns:', err);
        setCampaigns([]);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    fetchCampaigns();

    // Poll for updates every 5 seconds
    const interval = setInterval(() => {
      if (mountedRef.current && user?.id) {
        fetchCampaigns();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user?.id]);

  // Handle user sign out
  const handleSignOut = () => {
    signOut();
    window.location.reload();
  };

  /**
   * Initiate the delete process by showing the confirmation modal
   */
  const confirmDeleteCampaign = (campaignId: string, campaignName: string) => {
    setCampaignToDelete({ id: campaignId, name: campaignName });
    setShowDeleteConfirm(true);
  };

  /**
   * Execute the actual deletion after confirmation
   */
  const executeDeleteCampaign = async () => {
    if (!campaignToDelete) return;

    const { id: campaignId } = campaignToDelete;

    try {
      setLoading(true); // Show loading state during deletion

      // 1. Delete generated content first (foreign key constraint usually requires this, or cascade delete)
      const { error: contentError } = await supabase
        .from('generated_content')
        .delete()
        .eq('campaign_id', campaignId);

      if (contentError) {
        console.error('Error deleting generated content:', contentError);
        alert('Failed to delete generated content. Please try again.');
        setLoading(false);
        return;
      }

      // 2. Delete the campaign from form_idea
      const { error: campaignError } = await supabase
        .from('form_idea')
        .delete()
        .eq('id', campaignId);

      if (campaignError) {
        console.error('Error deleting campaign:', campaignError);
        alert('Failed to delete campaign. Please try again.');
        setLoading(false);
        return;
      }

      // 3. Update local state to remove the deleted campaign
      setCampaigns(prev => prev.filter(c => c.id !== campaignId));
      setLoading(false);

    } catch (err) {
      console.error('Unexpected error during deletion:', err);
      alert('An unexpected error occurred. Please try again.');
      setLoading(false);
    } finally {
      // Reset modal state
      setShowDeleteConfirm(false);
      setCampaignToDelete(null);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-menu')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground relative">

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteConfirm && campaignToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-card text-foreground p-10 rounded-2xl shadow-xl w-[400px] text-center border border-border">
            <h2 className="text-2xl font-bold mb-6">Delete Campaign?</h2>
            <p className="text-muted-foreground mb-10">
              Are you sure you want to delete <strong>"{campaignToDelete.name}"</strong>?
              <br /><br />
              This action cannot be undone and will delete all generated content associated with it.
            </p>

            <div className="flex justify-center gap-6">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setCampaignToDelete(null);
                }}
                className="px-6 py-3 rounded-xl bg-muted text-foreground hover:bg-muted/80"
              >
                Cancel
              </button>

              <button
                onClick={executeDeleteCampaign}
                className="px-6 py-3 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold tracking-tight text-foreground">ContentWell</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground hidden sm:block">
                {user?.contact_email}
              </span>
              <button
                onClick={handleSignOut}
                className="text-sm font-semibold text-primary hover:text-primary/80"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`py-4 text-sm font-medium border-b-2 transition-all ${activeTab === 'campaigns'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
            >
              Campaigns
            </button>
            <button
              onClick={() => setActiveTab('social')}
              className={`py-4 text-sm font-medium border-b-2 transition-all ${activeTab === 'social'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
            >
              Social Connections
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

          {activeTab === 'campaigns' ? (
            <>
              {/* Top Bar with Title and New Campaign Button */}
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                  Your Campaigns
                </h2>
                <button
                  onClick={() => onStartCampaign(0)}
                  className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
                >
                  + New Campaign
                </button>
              </div>

              {/* Loading State */}
              {loading ? (
                <div className="text-center py-20">
                  <LoaderIcon className="h-10 w-10 mx-auto text-primary animate-spin" />
                  <p className="mt-4 text-muted-foreground">Loading your campaigns...</p>
                </div>
              ) : campaigns.length === 0 ? (

                /* Empty State - Shown when no campaigns exist */
                <div className="text-center py-20 border-2 border-dashed rounded-lg">
                  <h3 className="text-lg font-semibold text-foreground">No campaigns yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Get started by creating your first content project.
                  </p>
                  <button
                    onClick={() => onStartCampaign(0)}
                    className="mt-6 inline-flex items-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    Create New Campaign
                  </button>
                </div>

              ) : (

                /* Campaign Grid - List of existing campaigns */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                  {campaigns.map(campaign => (
                    <div
                      key={campaign.id}
                      className="bg-card rounded-lg border p-6 flex flex-col justify-between hover:border-primary/50 transition shadow-sm group"
                    >
                      <div>
                        {/* Campaign Title */}
                        <h3 className="text-lg font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {campaign.name}
                        </h3>

                        {/* Campaign Idea/Subtitle */}
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2 h-10">
                          {campaign.idea}
                        </p>
                      </div>

                      <div className="mt-6 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(campaign.created_at).toLocaleDateString()}
                        </p>

                        {/* 3-dot Context Menu */}
                        <div className="relative dropdown-menu">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === campaign.id ? null : campaign.id);
                            }}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                            aria-label="Campaign options"
                          >
                            <svg className="w-5 h-5 text-foreground" fill="currentColor" viewBox="0 0 16 16">
                              <circle cx="8" cy="3" r="1.5" />
                              <circle cx="8" cy="8" r="1.5" />
                              <circle cx="8" cy="13" r="1.5" />
                            </svg>
                          </button>

                          {/* Dropdown Menu Items */}
                          {openMenuId === campaign.id && (
                            <div className="absolute right-0 bottom-full mb-2 w-40 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                              {/* Publish Option */}
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onStartCampaign(campaign.id);
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                </svg>
                                Publish
                              </button>

                              {/* Edit Option */}
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onStartCampaign(`edit:${campaign.id}`);
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit
                              </button>

                              {/* Delete Option */}
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  confirmDeleteCampaign(campaign.id, campaign.name);
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                </div>
              )}
            </>
          ) : (
            <SocialConnections />
          )}

        </div>
      </main>
    </div>
  );
};

export default Dashboard;
