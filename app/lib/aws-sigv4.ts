import { createHmac, createHash } from 'crypto';

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  let k = hmacSha256(`AWS4${secretKey}`, dateStamp);
  k = hmacSha256(k, region);
  k = hmacSha256(k, service);
  k = hmacSha256(k, 'aws4_request');
  return k;
}

export function signAwsRequest(
  method: string,
  url: string,
  body: string,
  region: string,
  service: string,
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken?: string,
): Record<string, string> {
  const u = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'host': u.host,
    'x-amz-date': amzDate,
  };
  if (sessionToken) {
    headers['x-amz-security-token'] = sessionToken;
  }

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
  const payloadHash = sha256(body);

  // AWS SigV4: the canonical URI must be URI-encoded with the exception of '/'
  // This applies even to already-encoded characters: '%3A' becomes '%253A'
  const canonicalPath = u.pathname.split('/').map(encodeURIComponent).join('/');

  const canonicalRequest = [
    method,
    canonicalPath,
    u.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  delete headers['host'];

  return headers;
}
