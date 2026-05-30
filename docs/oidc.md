# OIDC / SSO Authentication

ServerSphere supports authentication via any OpenID Connect (OIDC) provider — Google Workspace, Microsoft Entra ID (Azure AD), GitHub, GitLab, Auth0, Okta, Keycloak, and any provider that implements the OIDC standard.

## How it Works

1. User clicks **"Login with SSO"** on the login page
2. Browser redirects to your identity provider
3. After authentication, user is redirected back to ServerSphere
4. If enabled, new users are **auto-provisioned** (created on first login)
5. Role can be automatically assigned based on OIDC group membership

## Configuration

Add these environment variables to your `docker-compose.yml` or `.env` file:

```env
# Enable OIDC
OIDC_ENABLED=true

# Provider display name (shown on login button)
OIDC_NAME="Google Workspace"

# OIDC Discovery URL
# Google:   https://accounts.google.com/.well-known/openid-configuration
# Azure AD: https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration
# GitHub:   https://token.actions.githubusercontent.com/.well-known/openid-configuration
# GitLab:   https://gitlab.com/.well-known/openid-configuration
# Keycloak: https://{HOST}/realms/{REALM}/.well-known/openid-configuration
OIDC_DISCOVERY_URL=https://accounts.google.com/.well-known/openid-configuration

# Client credentials from your OIDC provider
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret

# Optional: scope (default: openid profile email)
OIDC_SCOPE=openid profile email

# Auto-provision new users on first login (default: true)
OIDC_AUTO_PROVISION=true

# Default role for new users (default: viewer)
# Options: viewer, operator, admin
OIDC_DEFAULT_ROLE=viewer

# Optional: Auto-assign admin role if user belongs to a specific group
OIDC_ADMIN_GROUP=server-admin

# Optional: Auto-assign operator role if user belongs to a specific group
OIDC_OPERATOR_GROUP=server-operator
```

> **Note:** `OIDC_ADMIN_GROUP` takes priority over `OIDC_OPERATOR_GROUP`. If a user is in both, they get admin.

## Setting up with Google Workspace

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application type)
3. Add authorized redirect URI: `https://your-serversphere-domain.com/api/auth/oidc/callback`
4. Copy the Client ID and Client Secret
5. Set environment variables:
   ```env
   OIDC_ENABLED=true
   OIDC_NAME="Google"
   OIDC_DISCOVERY_URL=https://accounts.google.com/.well-known/openid-configuration
   OIDC_CLIENT_ID=your-client-id
   OIDC_CLIENT_SECRET=your-client-secret
   ```

## Setting up with Microsoft Entra ID (Azure AD)

1. Go to [Azure Portal](https://portal.azure.com/) → App registrations → New registration
2. Set redirect URI: `https://your-serversphere-domain.com/api/auth/oidc/callback`
3. Note the **Tenant ID**, **Client ID**, and create a **Client Secret**
4. Set environment variables:
   ```env
   OIDC_ENABLED=true
   OIDC_NAME="Microsoft"
   OIDC_DISCOVERY_URL=https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration
   OIDC_CLIENT_ID=your-client-id
   OIDC_CLIENT_SECRET=your-client-secret
   ```
5. *(Optional)* Under **App roles**, create roles like `server-admin`, `server-operator` and assign to users/groups. Map them with `OIDC_ADMIN_GROUP` and `OIDC_OPERATOR_GROUP`.

## Role Mapping from OIDC Groups

ServerSphere automatically maps OIDC group membership to built-in roles:

| OIDC Group | ServerSphere Role |
|---|---|
| Matches `OIDC_ADMIN_GROUP` | **admin** — full system access |
| Matches `OIDC_OPERATOR_GROUP` | **operator** — SSH + containers |
| No matching group | Default (`OIDC_DEFAULT_ROLE`) |

Groups are read from the `groups` claim in the OIDC userinfo response.

## Disabling Auto-Provision

Set `OIDC_AUTO_PROVISION=false` to require an admin to manually create user accounts before they can log in via SSO. Users who don't exist in the database will see:

> *"SSO login is not allowed. Contact an administrator."*

## Security Notes

- OIDC users have **password_hash** set to `oidc:{sub}` — they **cannot** log in using the password form
- Role changes made manually in the dashboard **persist** even after re-authentication (only the initial role is set from OIDC groups)
- The OAuth state cookie (`ss_oauth`) expires after 10 minutes
- Session cookies are `httponly` with `samesite=lax`
