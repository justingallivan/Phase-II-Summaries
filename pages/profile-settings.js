/**
 * Profile Settings Page
 *
 * Manage user profiles and their settings:
 * - List all profiles with edit/archive actions
 * - Set default profile
 * - API key management
 * - Model preference overrides per app
 */

import { useState, useEffect } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import { useProfile } from '../shared/context/ProfileContext';
import ApiKeyManager from '../shared/components/ApiKeyManager';
import ApiSettingsPanel from '../shared/components/ApiSettingsPanel';

// Preset colors for avatar selection
const AVATAR_COLORS = [
  '#6366f1', // Indigo (default)
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#3b82f6', // Blue
  '#6b7280', // Gray
];

export default function ProfileSettings() {
  const {
    profiles,
    currentProfile,
    isLoading,
    createProfile,
    updateProfile,
    archiveProfile,
    selectProfile,
    refreshProfiles
  } = useProfile();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileColor, setNewProfileColor] = useState(AVATAR_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState('');

  // Reset form when closing
  const resetForm = () => {
    setShowCreateForm(false);
    setEditingProfile(null);
    setNewProfileName('');
    setNewProfileColor(AVATAR_COLORS[0]);
    setError(null);
  };

  // Handle create profile
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const profile = await createProfile({
        name: newProfileName.trim(),
        avatarColor: newProfileColor,
        isDefault: profiles.length === 0
      });

      // Select the newly created profile
      await selectProfile(profile.id);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit profile
  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingProfile || !newProfileName.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await updateProfile(editingProfile.id, {
        name: newProfileName.trim(),
        displayName: newProfileName.trim(),
        avatarColor: newProfileColor
      });
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle archive profile
  const handleArchive = async (profile) => {
    if (!confirm(`Are you sure you want to archive "${profile.displayName || profile.name}"? This will hide the profile but preserve its data.`)) {
      return;
    }

    try {
      await archiveProfile(profile.id);
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle set as default
  const handleSetDefault = async (profile) => {
    try {
      await updateProfile(profile.id, { isDefault: true });
    } catch (err) {
      setError(err.message);
    }
  };

  // Start editing a profile
  const startEdit = (profile) => {
    setEditingProfile(profile);
    setNewProfileName(profile.displayName || profile.name);
    setNewProfileColor(profile.avatarColor || AVATAR_COLORS[0]);
    setShowCreateForm(false);
    setError(null);
  };

  if (isLoading) {
    return (
      <Layout title="Profile Settings" maxWidth="4xl">
        <PageHeader
          title="Profile Settings"
          subtitle="Manage your user profiles and preferences"
        />
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-500">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Profile Settings" maxWidth="4xl">
      <PageHeader
        title="Profile Settings"
        subtitle="Manage your user profiles and preferences"
      />

      <div className="py-8 space-y-8">
        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Current Profile Card */}
        {currentProfile && (
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Profile</h2>
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-semibold"
                style={{ backgroundColor: currentProfile.avatarColor }}
              >
                {(currentProfile.displayName || currentProfile.name || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-lg font-medium text-gray-900">
                  {currentProfile.displayName || currentProfile.name}
                </div>
                <div className="text-sm text-gray-500">
                  {currentProfile.isDefault && (
                    <span className="inline-flex items-center gap-1 text-indigo-600">
                      <span>Default profile</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* API Keys Section */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">API Configuration</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Claude API Key</h3>
              <ApiKeyManager
                onApiKeySet={setApiKey}
                required={false}
              />
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Additional API Keys</h3>
              <ApiSettingsPanel onSettingsChange={() => {}} />
            </div>
          </div>
        </Card>

        {/* All Profiles Section */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">All Profiles</h2>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowCreateForm(true);
                setEditingProfile(null);
                setNewProfileName('');
                setNewProfileColor(AVATAR_COLORS[0]);
              }}
            >
              + New Profile
            </Button>
          </div>

          {/* Create/Edit Form */}
          {(showCreateForm || editingProfile) && (
            <form
              onSubmit={editingProfile ? handleEdit : handleCreate}
              className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              <h3 className="text-sm font-semibold text-gray-800 mb-4">
                {editingProfile ? 'Edit Profile' : 'Create New Profile'}
              </h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="e.g., Work, Personal, Research"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewProfileColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        newProfileColor === color
                          ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110'
                          : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={resetForm}
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={!newProfileName.trim() || isSubmitting}
                  loading={isSubmitting}
                >
                  {editingProfile ? 'Save Changes' : 'Create Profile'}
                </Button>
              </div>
            </form>
          )}

          {/* Profile List */}
          <div className="space-y-2">
            {profiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No profiles yet. Create your first profile to get started.
              </div>
            ) : (
              profiles.map((profile) => (
                <div
                  key={profile.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    currentProfile?.id === profile.id
                      ? 'border-indigo-200 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold"
                    style={{ backgroundColor: profile.avatarColor }}
                  >
                    {(profile.displayName || profile.name || 'U')[0].toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {profile.displayName || profile.name}
                      </span>
                      {profile.isDefault && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                      {currentProfile?.id === profile.id && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Last used: {new Date(profile.lastUsedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentProfile?.id !== profile.id && (
                      <button
                        onClick={() => selectProfile(profile.id)}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Switch
                      </button>
                    )}
                    {!profile.isDefault && (
                      <button
                        onClick={() => handleSetDefault(profile)}
                        className="text-sm text-gray-500 hover:text-gray-700"
                        title="Set as default"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(profile)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Edit
                    </button>
                    {profiles.length > 1 && (
                      <button
                        onClick={() => handleArchive(profile)}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Info Card */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">About Profiles</h2>
          <div className="prose prose-sm text-gray-600">
            <p>
              User profiles allow multiple people to use this application with their own API keys
              and settings. Each profile stores:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Claude API key (encrypted)</li>
              <li>ORCID, NCBI, and SerpAPI credentials (encrypted)</li>
              <li>Saved candidates and proposal history</li>
              <li>Email template settings (coming soon)</li>
            </ul>
            <p className="mt-3">
              <strong>Note:</strong> Researchers and grant cycles are shared across all profiles
              to maintain a unified database of experts.
            </p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
