export type CloudTrailEvent = {
  event_id: string;
  event_name: string;
  username: string;
  source_ip: string;
};

export type IamRolePolicy = {
  role_name: string;
  policy: unknown;
};

export type BucketEncryption = {
  bucket: string;
  sse_algorithm: string;
  bucket_key_enabled: boolean;
};

export interface AwsProvider {
  getCloudTrailEvents(): Promise<CloudTrailEvent[]>;
  getIamRolePolicy(roleName: string): Promise<IamRolePolicy>;
  getBucketEncryption(bucket: string): Promise<BucketEncryption>;
}
