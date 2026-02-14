/**
 * NextAuth.js API Route - Microsoft Azure AD Authentication
 *
 * Handles OAuth flow with Azure AD (Entra ID) for organization single sign-on.
 * Auto-links or creates user profiles based on Azure email.
 *
 * Environment variables required:
 * - NEXTAUTH_URL: Base URL of the app (http://localhost:3000 for dev)
 * - NEXTAUTH_SECRET: Random 32-byte secret for JWT encryption
 * - AZURE_AD_CLIENT_ID: From Azure Portal app registration
 * - AZURE_AD_CLIENT_SECRET: From Azure Portal app registration
 * - AZURE_AD_TENANT_ID: Your organization's tenant ID
 */

import NextAuth from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { sql } from '@vercel/postgres';
import { DEFAULT_APP_GRANTS } from '../../../shared/config/appRegistry';

export const authOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      tenantId: process.env.AZURE_AD_TENANT_ID,
      authorization: {
        params: {
          scope: 'openid email profile User.Read',
        },
      },
    }),
  ],

  callbacks: {
    /**
     * signIn callback - runs after successful Azure auth
     * Creates or links user profile in the database
     */
    async signIn({ user, account, profile }) {
      if (account?.provider === 'azure-ad') {
        try {
          const azureId = profile?.oid || user.id;
          const azureEmail = user.email?.toLowerCase();
          const displayName = user.name || profile?.name || azureEmail;

          if (!azureEmail) {
            console.error('No email returned from Azure AD');
            return false;
          }

          // Check if a profile with this Azure ID already exists
          const existingByAzureId = await sql`
            SELECT id, name, display_name, azure_email, needs_linking
            FROM user_profiles
            WHERE azure_id = ${azureId} AND is_active = true
          `;

          if (existingByAzureId.rows.length > 0) {
            // User already linked, update last login
            const profile = existingByAzureId.rows[0];
            await sql`
              UPDATE user_profiles
              SET last_login_at = CURRENT_TIMESTAMP, last_used_at = CURRENT_TIMESTAMP
              WHERE id = ${profile.id}
            `;
            return true;
          }

          // Check if any profile needs linking (first login scenario)
          const existingByEmail = await sql`
            SELECT id, name, display_name, azure_id
            FROM user_profiles
            WHERE azure_email = ${azureEmail} AND is_active = true
          `;

          if (existingByEmail.rows.length > 0 && !existingByEmail.rows[0].azure_id) {
            // Profile exists with this email but not linked - link it now
            await sql`
              UPDATE user_profiles
              SET azure_id = ${azureId}, last_login_at = CURRENT_TIMESTAMP,
                  last_used_at = CURRENT_TIMESTAMP, needs_linking = false
              WHERE id = ${existingByEmail.rows[0].id}
            `;
            return true;
          }

          // Check if there are unlinked profiles (existing users who need to choose)
          const unlinkedProfiles = await sql`
            SELECT id FROM user_profiles
            WHERE azure_id IS NULL AND is_active = true
          `;

          if (unlinkedProfiles.rows.length > 0) {
            // Mark this user as needing to link to an existing profile
            // Create a temporary profile that will be updated or deleted after linking
            const tempResult = await sql`
              INSERT INTO user_profiles (name, display_name, azure_id, azure_email, is_active, needs_linking)
              VALUES (${azureEmail}, ${displayName}, ${azureId}, ${azureEmail}, true, true)
              ON CONFLICT (azure_id) DO UPDATE
              SET last_login_at = CURRENT_TIMESTAMP, last_used_at = CURRENT_TIMESTAMP
              RETURNING id
            `;

            // Grant default apps to new user
            if (tempResult.rows[0]?.id) {
              await grantDefaultApps(tempResult.rows[0].id);
            }

            return true;
          }

          // No existing profiles - create new one
          const newResult = await sql`
            INSERT INTO user_profiles (name, display_name, azure_id, azure_email, is_default, needs_linking)
            VALUES (${azureEmail}, ${displayName}, ${azureId}, ${azureEmail}, true, false)
            ON CONFLICT (azure_id) DO UPDATE
            SET last_login_at = CURRENT_TIMESTAMP, last_used_at = CURRENT_TIMESTAMP
            RETURNING id
          `;

          // Grant default apps to new user
          if (newResult.rows[0]?.id) {
            await grantDefaultApps(newResult.rows[0].id);
          }

          return true;
        } catch (error) {
          console.error('Error in signIn callback:', error);
          // Allow sign in even if database operation fails
          // Profile linking can happen later
          return true;
        }
      }
      return true;
    },

    /**
     * jwt callback - adds profile info to JWT token
     */
    async jwt({ token, user, account, profile }) {
      if (account?.provider === 'azure-ad') {
        token.azureId = profile?.oid || user?.id;
        token.azureEmail = user?.email?.toLowerCase();
      }

      // Look up the linked profile ID
      if (token.azureId) {
        try {
          const result = await sql`
            SELECT id, name, display_name, avatar_color, needs_linking, last_login_at
            FROM user_profiles
            WHERE azure_id = ${token.azureId} AND is_active = true
            LIMIT 1
          `;

          if (result.rows.length > 0) {
            token.profileId = result.rows[0].id;
            token.profileName = result.rows[0].display_name || result.rows[0].name;
            token.avatarColor = result.rows[0].avatar_color;
            token.needsLinking = result.rows[0].needs_linking;
            token.isNewUser = !result.rows[0].last_login_at;
          }
        } catch (error) {
          console.error('Error looking up profile in jwt callback:', error);
        }
      }

      return token;
    },

    /**
     * session callback - exposes profile info to client
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.azureId = token.azureId;
        session.user.azureEmail = token.azureEmail;
        session.user.profileId = token.profileId;
        session.user.profileName = token.profileName;
        session.user.avatarColor = token.avatarColor;
        session.user.needsLinking = token.needsLinking;
        session.user.isNewUser = token.isNewUser;
      }
      return session;
    },
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Debug mode in development
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Grant default apps to a newly created user profile
 */
async function grantDefaultApps(profileId) {
  try {
    for (const appKey of DEFAULT_APP_GRANTS) {
      await sql`
        INSERT INTO user_app_access (user_profile_id, app_key)
        VALUES (${profileId}, ${appKey})
        ON CONFLICT (user_profile_id, app_key) DO NOTHING
      `;
    }
  } catch (error) {
    console.error('Error granting default apps:', error);
    // Non-fatal — user can still sign in
  }
}

export default NextAuth(authOptions);
