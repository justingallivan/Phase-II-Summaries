/**
 * ProfileSelector - Dropdown component for switching user profiles
 *
 * Shows in the header. Displays:
 * - Colored dot + profile name
 * - Dropdown with all profiles
 * - "Create New Profile" option
 * - Link to profile settings
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useProfile } from '../context/ProfileContext';

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

export default function ProfileSelector() {
  const {
    profiles,
    currentProfile,
    isLoading,
    selectProfile,
    createProfile
  } = useProfile();

  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileColor, setNewProfileColor] = useState(AVATAR_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setShowCreateForm(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProfileSelect = async (profileId) => {
    await selectProfile(profileId);
    setIsOpen(false);
  };

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      await createProfile({
        name: newProfileName.trim(),
        avatarColor: newProfileColor,
        isDefault: profiles.length === 0
      });

      setNewProfileName('');
      setNewProfileColor(AVATAR_COLORS[0]);
      setShowCreateForm(false);
      setIsOpen(false);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
        <div className="w-3 h-3 rounded-full bg-gray-300 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  // Show "Create Profile" button if no profiles exist
  if (profiles.length === 0) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => {
            setIsOpen(true);
            setShowCreateForm(true);
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <span className="text-gray-400">+</span>
          <span>Create Profile</span>
        </button>

        {isOpen && showCreateForm && (
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
            <CreateProfileForm
              name={newProfileName}
              setName={setNewProfileName}
              color={newProfileColor}
              setColor={setNewProfileColor}
              isCreating={isCreating}
              error={createError}
              onSubmit={handleCreateProfile}
              onCancel={() => {
                setShowCreateForm(false);
                setIsOpen(false);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: currentProfile?.avatarColor || '#6366f1' }}
        />
        <span>{currentProfile?.displayName || currentProfile?.name || 'Select Profile'}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          {!showCreateForm ? (
            <>
              {/* Profile List */}
              <div className="py-2 max-h-64 overflow-y-auto">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => handleProfileSelect(profile.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors
                      ${currentProfile?.id === profile.id ? 'bg-gray-50' : ''}`}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: profile.avatarColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {profile.displayName || profile.name}
                      </div>
                      {profile.isDefault && (
                        <div className="text-xs text-gray-500">Default</div>
                      )}
                    </div>
                    {currentProfile?.id === profile.id && (
                      <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Actions */}
              <div className="py-2">
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <span className="w-4 h-4 flex items-center justify-center text-gray-400">+</span>
                  <span>Create New Profile</span>
                </button>
                <Link
                  href="/profile-settings"
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <span className="w-4 h-4 flex items-center justify-center text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </span>
                  <span>Manage Profiles</span>
                </Link>
              </div>
            </>
          ) : (
            <CreateProfileForm
              name={newProfileName}
              setName={setNewProfileName}
              color={newProfileColor}
              setColor={setNewProfileColor}
              isCreating={isCreating}
              error={createError}
              onSubmit={handleCreateProfile}
              onCancel={() => setShowCreateForm(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Create profile form component
function CreateProfileForm({
  name,
  setName,
  color,
  setColor,
  isCreating,
  error,
  onSubmit,
  onCancel
}) {
  return (
    <form onSubmit={onSubmit} className="p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Create New Profile</h3>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Profile Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Work, Personal"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          autoFocus
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Color
        </label>
        <div className="flex gap-2 flex-wrap">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-transform ${
                color === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || isCreating}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {isCreating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </form>
  );
}
