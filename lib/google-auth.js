import { GoogleAuth, ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

export const READ_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

// Endpoints and scopes are code-owned; configuration cannot redirect tokens.
export function createGoogleAuthClient(config, oidcSupplier = () => getVercelOidcToken()) {
  if (config.authMode === 'vercel_oidc') {
    const {projectNumber, poolId, providerId, serviceAccountEmail} = config.federation;
    return ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
      scopes: [READ_SCOPE],
      subject_token_supplier: {getSubjectToken: oidcSupplier}
    });
  }
  return new GoogleAuth({credentials: config.credentials, scopes: [READ_SCOPE]});
}
