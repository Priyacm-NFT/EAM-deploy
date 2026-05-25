import { PutObjectCommand, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createReportS3Client() {
  return new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? '9000'}`,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
  });
}

export function reportBucket(): string {
  return process.env.MINIO_REPORTS_BUCKET ?? process.env.MINIO_BUCKET ?? 'eam-attachments';
}

export async function uploadReportOutput(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<string> {
  const client = createReportS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: reportBucket(),
      Key: key,
      Body: typeof body === 'string' ? Buffer.from(body, 'utf-8') : body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function presignReportDownload(key: string): Promise<string> {
  const client = createReportS3Client();
  const command = new GetObjectCommand({ Bucket: reportBucket(), Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export function buildReportOutputKey(
  tenantId: string,
  reportId: string,
  runId: string,
  extension: string,
): string {
  return `reports/${tenantId}/${reportId}/${runId}.${extension}`;
}
