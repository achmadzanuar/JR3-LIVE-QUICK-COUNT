import test from 'node:test';
import assert from 'node:assert/strict';
import {readConfiguration} from '../lib/source.js';
import {createGoogleAuthClient, READ_SCOPE} from '../lib/google-auth.js';

const env = {
  GOOGLE_AUTH_MODE:'vercel_oidc', VERCEL_ENV:'production', ELECTION_MODE:'production',
  GOOGLE_SPREADSHEET_ID:'UNIT_TEST_MAIN_SPREADSHEET_12345', GOOGLE_SHEET_GID:'861129643',
  GCP_PROJECT_NUMBER:'123456789012', GCP_WORKLOAD_IDENTITY_POOL_ID:'jr3-vercel',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'vercel',
  GCP_SERVICE_ACCOUNT_EMAIL:'reader@unit-test-project.iam.gserviceaccount.com'
};

test('OIDC production uses validated identifiers without a private key',()=>{
  const config=readConfiguration(env);
  assert.equal(config.authMode,'vercel_oidc');
  assert.equal(config.credentials,undefined);
  assert.equal(config.federation.projectNumber,env.GCP_PROJECT_NUMBER);
});

test('OIDC rejects preview, development, incomplete and redirected configuration',()=>{
  for(const patch of [{VERCEL_ENV:'preview'},{VERCEL_ENV:'development'},{VERCEL_ENV:undefined},{ELECTION_MODE:'dummy'}]) {
    assert.throws(()=>readConfiguration({...env,...patch}),/GOOGLE_AUTH_INVALID/);
  }
  assert.throws(()=>readConfiguration({...env,GCP_PROJECT_NUMBER:''}),/SOURCE_NOT_CONFIGURED/);
  for(const patch of [{GCP_PROJECT_NUMBER:'123/evil'},{GCP_WORKLOAD_IDENTITY_POOL_ID:'../evil'},
    {GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID:'https://example.test'},
    {GCP_SERVICE_ACCOUNT_EMAIL:'reader@example.test/path'},{GOOGLE_AUTH_MODE:'auto'}]) {
    assert.throws(()=>readConfiguration({...env,...patch}),/CONFIG_INVALID/);
  }
});

test('OIDC exchanges identity then impersonates only the configured reader with Sheets readonly scope',async()=>{
  let suppliers=0;
  const client=createGoogleAuthClient(readConfiguration(env),async()=>{suppliers++;return 'FAKE_VERCEL_JWT';});
  const exchanges=[];
  client.stsCredential.exchangeToken=async(options)=>{
    exchanges.push(options);
    return {access_token:'FAKE_FEDERATED_TOKEN',expires_in:3600};
  };
  const requests=[];
  client.transporter.request=async(options)=>{
    requests.push(options);
    return {data:{accessToken:'FAKE_SHEETS_TOKEN',expireTime:new Date(Date.now()+3600000).toISOString()}};
  };
  assert.equal((await client.getAccessToken()).token,'FAKE_SHEETS_TOKEN');
  assert.equal((await client.getAccessToken()).token,'FAKE_SHEETS_TOKEN');
  assert.equal(suppliers,1);
  assert.equal(exchanges[0].subjectToken,'FAKE_VERCEL_JWT');
  assert.equal(exchanges[0].audience,'//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/jr3-vercel/providers/vercel');
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/reader@unit-test-project.iam.gserviceaccount.com:generateAccessToken');
  assert.deepEqual(requests[0].data.scope,[READ_SCOPE]);
  assert.equal(requests[0].headers.authorization,'Bearer FAKE_FEDERATED_TOKEN');
});

test('missing runtime identity fails before any Google token exchange',async()=>{
  const client=createGoogleAuthClient(readConfiguration(env),async()=>{throw new Error('No runtime identity');});
  let exchanges=0;
  client.stsCredential.exchangeToken=async()=>{exchanges++;throw new Error('Unexpected exchange');};
  await assert.rejects(client.getAccessToken(),/No runtime identity/);
  assert.equal(exchanges,0);
});
