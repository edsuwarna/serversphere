# OIDC / SSO Authentication

ServerSphere supports authentication via any OpenID Connect (OIDC) provider — Google Workspace, Microsoft Entra ID (Azure AD), GitHub, GitLab, Auth0, Okta, Keycloak, Authentik, and any provider that implements the OIDC standard.

## How it Works

1. User clicks **"Login with SSO"** on the login page
2. Browser redirects to your identity provider
3. After authentication, user is redirected back to ServerSphere
4. If enabled, new users are **auto-provisioned** (created on first login)
5. Role can be automatically assigned based on OIDC group membership

## Configuration Reference

Add these environment variables to your `docker-compose.yml` or `.env` file:

```env
# Enable OIDC
OIDC_ENABLED=true

# Provider display name (shown on login button)
OIDC_NAME="SSO"

# OIDC Discovery URL — see provider-specific guides below
OIDC_DISCOVERY_URL=https://your-provider.com/.well-known/openid-configuration

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

---

## Provider Setup Guides

The **redirect URI** for all providers is:
```
https://your-serversphere-domain.com/api/auth/oidc/callback
```

Replace `your-serversphere-domain.com` with your actual ServerSphere domain or IP.

---

### 🔑 Google Workspace

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Add authorized redirect URI: `https://your-serversphere-domain.com/api/auth/oidc/callback`
5. Copy the **Client ID** and **Client Secret**

```env
OIDC_ENABLED=true
OIDC_NAME="Google"
OIDC_DISCOVERY_URL=https://accounts.google.com/.well-known/openid-configuration
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

### 🔑 GitHub

1. Go to [GitHub Settings](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. **Application name:** ServerSphere (or any name)
3. **Homepage URL:** `https://your-serversphere-domain.com`
4. **Authorization callback URL:** `https://your-serversphere-domain.com/api/auth/oidc/callback`
5. Click **Register application**
6. Copy the **Client ID** and generate a **Client Secret**

```env
OIDC_ENABLED=true
OIDC_NAME="GitHub"
OIDC_DISCOVERY_URL=https://token.actions.githubusercontent.com/.well-known/openid-configuration
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_SCOPE=openid profile email
```

> **Note:** GitHub's OIDC is primarily designed for GitHub Actions. For user login, GitHub uses a standard OAuth flow, not OIDC. For team authentication with GitHub, consider using GitHub as an OIDC provider via a service like [dex](https://dexidp.io/) or use GitHub's OAuth directly (check the community for integration guides).

### 🔑 GitLab

1. Go to your GitLab instance → **Admin Area** → **Applications** (or **User Settings** → **Applications**)
2. **Name:** ServerSphere
3. **Redirect URI:** `https://your-serversphere-domain.com/api/auth/oidc/callback`
4. **Scopes:** `openid`, `profile`, `email`
5. Click **Save application**
6. Copy the **Application ID** (`client_id`) and **Secret** (`client_secret`)

```env
OIDC_ENABLED=true
OIDC_NAME="GitLab"
OIDC_DISCOVERY_URL=https://gitlab.com/.well-known/openid-configuration
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

> For self-hosted GitLab, use your instance URL: `https://gitlab.your-company.com/.well-known/openid-configuration`

### 🔑 Authentik

1. In your Authentik admin interface, go to **Applications** → **Providers** → **Create Provider**
2. Choose **OAuth2/OpenID Provider**
3. **Client Type:** Confidential
4. **Redirect URIs:** `https://your-serversphere-domain.com/api/auth/oidc/callback`
5. **Scopes:** `openid`, `email`, `profile`
6. Save and note the **Client ID** and **Client Secret**
7. Create an **Application** that uses this provider (Applications → Create Application)
8. Assign the application to users/groups under **Applications** → **Policy / Binding**

```env
OIDC_ENABLED=true
OIDC_NAME="Authentik"
OIDC_DISCOVERY_URL=https://authentik.your-company.com/application/o/server-sphere/.well-known/openid-configuration
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

> **Discovery URL format:** `https://{AUTHENTIK_HOST}/application/o/{APPLICATION_SLUG}/.well-known/openid-configuration`

**Role Mapping with Authentik Groups:**
Authentik sends groups in the `groups` claim. Create groups in Authentik (e.g., `server-admin`, `server-operator`), assign users, then configure:

```env
OIDC_ADMIN_GROUP=server-admin
OIDC_OPERATOR_GROUP=server-operator
```

Make sure the OIDC scope includes `openid profile email groups` and that Authentik is configured to include the `groups` claim in the ID token.

### 🔑 Keycloak

1. Open your Keycloak admin console → **Clients** → **Create Client**
2. **Client ID:** `serversphere` (or any ID)
3. **Client authentication:** On (for client secret)
4. **Standard flow:** Enabled
5. **Valid redirect URIs:** `https://your-serversphere-domain.com/api/auth/oidc/callback`
6. Click **Save**
7. Go to the **Credentials** tab and copy the **Client Secret**
8. *(Optional)* Under the **Client scopes** tab, add the `groups` scope if you want role mapping

```env
OIDC_ENABLED=true
OIDC_NAME="Keycloak"
OIDC_DISCOVERY_URL=https://keycloak.your-company.com/realms/your-realm/.well-known/openid-configuration
OIDC_CLIENT_ID=serversphere
OIDC_CLIENT_SECRET=your-client-secret
```

**Role Mapping with Keycloak Groups:**
1. In Keycloak, go to **Groups** → create groups: `server-admin`, `server-operator`
2. Assign users to these groups
3. Configure the client to include the `groups` claim in the ID token:
   - Go to **Client scopes** → **Create client scope** (or edit default)
   - Add a **Mapper** → **Group Membership** → set Token Claim Name to `groups`
4. Add the client scope to your client

```env
OIDC_ADMIN_GROUP=/server-admin
OIDC_OPERATOR_GROUP=/server-operator
```

> Keycloak returns group paths like `/server-admin` — include the `/` prefix when setting `OIDC_ADMIN_GROUP`.

### 🔑 Microsoft Entra ID (Azure AD)

1. Go to [Azure Portal](https://portal.azure.com/) → **App registrations** → **New registration**
2. **Name:** ServerSphere
3. **Redirect URI:** Web → `https://your-serversphere-domain.com/api/auth/oidc/callback`
4. Click **Register**
5. Note the **Application (client) ID** and **Directory (tenant) ID**
6. Go to **Certificates & secrets** → **New client secret** — copy the secret value

```env
OIDC_ENABLED=true
OIDC_NAME="Microsoft"
OIDC_DISCOVERY_URL=https://login.microsoftonline.com/{TENANT_ID}/v2.0/.well-known/openid-configuration
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

Replace `{TENANT_ID}` with your actual Azure tenant ID.

**Role Mapping with Entra ID Groups:**
1. In the app registration, go to **App roles** → **Create app role**
2. Create roles like `server-admin`, `server-operator`
3. Assign users/groups to these roles via **Enterprise applications** → your app → **Users and groups**
4. Under **Token configuration**, add a **groups claim** (Security groups or Application roles)

---

## Role Mapping from OIDC Groups

ServerSphere automatically maps OIDC group membership to built-in roles:

| OIDC Group | ServerSphere Role |
|---|---|
| Matches `OIDC_ADMIN_GROUP` | **admin** — full system access |
| Matches `OIDC_OPERATOR_GROUP` | **operator** — SSH + containers |
| No matching group | Default (`OIDC_DEFAULT_ROLE`) |

Groups are read from the `groups` claim in the OIDC userinfo response. The exact claim name and format can vary by provider — Authentik, Keycloak, and Azure AD use different conventions.

## OIDC-Compatible Providers

Any provider implementing the [OpenID Connect](https://openid.net/connect/) standard can work with ServerSphere. The only requirement is a **discovery URL** that exposes the `.well-known/openid-configuration` endpoint.

### Generic Setup

```env
OIDC_ENABLED=true
OIDC_NAME="Your Provider"
OIDC_DISCOVERY_URL=https://your-provider.com/.well-known/openid-configuration
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

### Examples of Compatible Providers

| Provider | Discovery URL Pattern | Notes |
|----------|----------------------|-------|
| **Auth0** | `https://{TENANT}.auth0.com/.well-known/openid-configuration` | Create a Regular Web Application |
| **Okta** | `https://{ORG}.okta.com/.well-known/openid-configuration` | Create a Web Application |
| **Ping Identity** | `https://{HOST}/.well-known/openid-configuration` | |
| **Amazon Cognito** | `https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}/.well-known/openid-configuration` | App client must have OIDC enabled |
| **Zitadel** | `https://{INSTANCE}/.well-known/openid-configuration` | |
| **Dex** | `https://{DEX_HOST}/.well-known/openid-configuration` | Open source OIDC federation |
| **Cloudflare Zero Trust** | `https://{TEAM}.cloudflareaccess.com/cdn-cgi/access/.well-known/openid-configuration` | |
| **Hydra** | `https://{HYDRA_HOST}/.well-known/openid-configuration` | Self-hosted OAuth2/OIDC |

## Disabling Auto-Provision

Set `OIDC_AUTO_PROVISION=false` to require an admin to manually create user accounts before they can log in via SSO. Users who don't exist in the database will see:

> *"SSO login is not allowed. Contact an administrator."*

## Security Notes

- OIDC users have `password_hash` set to `oidc:{sub}` — they **cannot** log in using the password form
- Role changes made manually in the dashboard **persist** even after re-authentication (only the initial role is set from OIDC groups)
- The OAuth state cookie (`ss_oauth`) expires after 10 minutes
- Session cookies are `httponly` with `samesite=lax`
- Always use HTTPS in production — the OIDC flow exchanges secrets via redirect URLs
