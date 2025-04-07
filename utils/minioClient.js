import AWS from 'aws-sdk';
import dotenv from 'dotenv';
dotenv.config();

export const s3 = new AWS.S3({
  accessKeyId: process.env.MINIO_ACCESS_KEY,
  secretAccessKey: process.env.MINIO_SECRET_KEY,
  endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
  region: 'us-east-1', // must be set
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  httpOptions: {
    timeout: 30000,        // 30s upload timeout
    connectTimeout: 10000,  // 5s connection timeout
  },
});

export const BUCKET_NAME = process.env.MINIO_BUCKET;


export const generateSignedUrl = (key, expiresInSeconds = 300) => {
    return s3.getSignedUrl("getObject", {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: expiresInSeconds, // default: 5 minutes
    });
  };
  