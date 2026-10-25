#!/usr/bin/env bash
# Keep LF line endings; Windows checkouts are governed by .gitattributes.
set -euo pipefail

SERVER="${KEYCLOAK_URL:-http://keycloak:8080}"
REALM="${GBAP_REALM:-gbap}"
ADMIN_USER="${KC_BOOTSTRAP_ADMIN_USERNAME:?missing KC_BOOTSTRAP_ADMIN_USERNAME}"
ADMIN_PASSWORD="${KC_BOOTSTRAP_ADMIN_PASSWORD:?missing KC_BOOTSTRAP_ADMIN_PASSWORD}"
IDENTITY_CLIENT_ID="${IDENTITY_ADMIN_CLIENT_ID:-gbap-identity-admin}"
IDENTITY_CLIENT_SECRET_FILE="${IDENTITY_ADMIN_CLIENT_SECRET_FILE:-/runtime/identity-admin-client-secret}"
KCADM=/opt/keycloak/bin/kcadm.sh

ready=0
for _ in $(seq 1 90); do
  if "$KCADM" config credentials --server "$SERVER" --realm master --user "$ADMIN_USER" --password "$ADMIN_PASSWORD" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  echo "Keycloak admin API did not become ready." >&2
  exit 1
fi

# Stage 3.7 Batch 17: ordinary employees should not be forced back through
# interactive login every day, while Remember Me must have a meaningfully
# longer bounded lifetime. Access tokens remain short-lived and are refreshed
# by the SPA; these values govern the server-side SSO session itself.
# Client-session values are zero so they inherit the realm SSO boundaries
# instead of reintroducing a shorter independent 24-hour ceiling.
"$KCADM" update "realms/$REALM" \
  -s ssoSessionIdleTimeout=604800 \
  -s ssoSessionMaxLifespan=2592000 \
  -s ssoSessionIdleTimeoutRememberMe=2592000 \
  -s ssoSessionMaxLifespanRememberMe=7776000 \
  -s clientSessionIdleTimeout=0 \
  -s clientSessionMaxLifespan=0 >/dev/null

echo "GBAP interactive session policy synchronized: normal 7d idle / 30d max; remember-me 30d idle / 90d max"

# Keycloak 24+ enables default username validators that intentionally reject
# CJK logins. GBAP is an administrator-provisioned internal application and its
# canonical login policy already accepts Unicode letters/numbers plus . _ @ -.
# Replace Keycloak's Latin/Common-only defaults with an equivalent explicit
# allowlist so the identity service and Keycloak enforce the same boundary.
# This bootstrap runs for both fresh and persisted realms, so an existing UAT
# realm is corrected without delete/recreate or username mutation.
user_profile_file="$(mktemp)"
cat > "$user_profile_file" <<'JSON'
{
  "attributes": [
    {
      "name": "username",
      "displayName": "${username}",
      "validations": {
        "length": { "min": 2, "max": 64 },
        "pattern": {
          "pattern": "^[\\p{L}\\p{N}._@-]{2,64}$",
          "error-message": "error-username-invalid-character"
        }
      },
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin", "user"]
      },
      "multivalued": false
    },
    {
      "name": "email",
      "displayName": "${email}",
      "validations": {
        "email": {},
        "length": { "max": 254 }
      },
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin", "user"]
      },
      "multivalued": false
    },
    {
      "name": "firstName",
      "displayName": "${firstName}",
      "validations": {
        "length": { "max": 128 },
        "person-name-prohibited-characters": {}
      },
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin", "user"]
      },
      "multivalued": false
    },
    {
      "name": "lastName",
      "displayName": "${lastName}",
      "validations": {
        "length": { "max": 128 },
        "person-name-prohibited-characters": {}
      },
      "permissions": {
        "view": ["admin", "user"],
        "edit": ["admin", "user"]
      },
      "multivalued": false
    }
  ]
}
JSON

if ! "$KCADM" update "users/profile" -r "$REALM" -f "$user_profile_file" >/dev/null; then
  rm -f "$user_profile_file"
  echo "GBAP Keycloak user-profile policy synchronization failed." >&2
  exit 1
fi
rm -f "$user_profile_file"

echo "GBAP Unicode username policy synchronized"

# Human GBAP tokens only authorize the actor inside gbap-identity-admin.
# They must not carry Keycloak realm-management privileges. Remove any grants
# left by an earlier UAT attempt, then isolate the four required permissions in
# a dedicated confidential service account.
for role in manage-users query-users view-users view-realm; do
  "$KCADM" remove-roles -r "$REALM" --uusername substrate-admin --cclientid realm-management --rolename "$role" >/dev/null 2>&1 || true
done

echo "Removed direct Keycloak realm-management grants from substrate-admin"

identity_client_uuid=$("$KCADM" get clients -r "$REALM" -q clientId="$IDENTITY_CLIENT_ID" --fields id --format csv --noquotes | tr -d '\r' | head -n 1)
if [ -z "$identity_client_uuid" ]; then
  "$KCADM" create clients -r "$REALM" \
    -s clientId="$IDENTITY_CLIENT_ID" \
    -s enabled=true \
    -s publicClient=false \
    -s serviceAccountsEnabled=true \
    -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false \
    -s fullScopeAllowed=true \
    -s clientAuthenticatorType=client-secret >/dev/null
  identity_client_uuid=$("$KCADM" get clients -r "$REALM" -q clientId="$IDENTITY_CLIENT_ID" --fields id --format csv --noquotes | tr -d '\r' | head -n 1)
else
  "$KCADM" update "clients/$identity_client_uuid" -r "$REALM" \
    -s enabled=true \
    -s publicClient=false \
    -s serviceAccountsEnabled=true \
    -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false \
    -s fullScopeAllowed=true \
    -s clientAuthenticatorType=client-secret >/dev/null
fi

if [ -z "$identity_client_uuid" ]; then
  echo "Keycloak identity administration service client could not be created." >&2
  exit 1
fi

service_username="service-account-$IDENTITY_CLIENT_ID"
for role in manage-users query-users view-users view-realm; do
  "$KCADM" add-roles -r "$REALM" --uusername "$service_username" --cclientid realm-management --rolename "$role" >/dev/null
  echo "Granted realm-management/$role to identity-admin service account"
done

client_secret=$("$KCADM" get "clients/$identity_client_uuid/client-secret" -r "$REALM" --fields value --format csv --noquotes | tr -d '\r' | head -n 1)
if [ -z "$client_secret" ]; then
  echo "Keycloak identity administration service client secret is unavailable." >&2
  exit 1
fi
mkdir -p "$(dirname "$IDENTITY_CLIENT_SECRET_FILE")"
umask 077
printf '%s' "$client_secret" > "$IDENTITY_CLIENT_SECRET_FILE"

echo "GBAP identity administration Keycloak bootstrap PASS"
