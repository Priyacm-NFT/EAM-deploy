import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createS3Client() {
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

export async function presignUpload(key: string, contentType: string): Promise<string> {
  const client = createS3Client();
  const bucket = process.env.MINIO_BUCKET ?? 'eam-attachments';
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: 900 });
}

export async function presignDownload(key: string): Promise<string> {
  const client = createS3Client();
  const bucket = process.env.MINIO_BUCKET ?? 'eam-attachments';
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

export async function objectExists(key: string): Promise<boolean> {
  const client = createS3Client();
  const bucket = process.env.MINIO_BUCKET ?? 'eam-attachments';
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
export async function deleteObject(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = createS3Client();
  const bucket = process.env.MINIO_BUCKET ?? 'eam-attachments';
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
