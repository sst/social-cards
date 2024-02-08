import { S3 } from "aws-sdk";
import { Bucket } from "sst/node/bucket";

export async function handler(event) {
  const path = event.path; // Ensure this ends with a slash

  await emptyS3Folder(path);
}

async function emptyS3Folder(path) {
  try {
    let continuationToken;
    do {
      const listResponse = await listAllObjects(path, continuationToken);
      continuationToken = listResponse.IsTruncated
        ? listResponse.NextContinuationToken
        : null;

      if (listResponse.Contents.length > 0) {
        await deleteObjects(listResponse.Contents);
      }
    } while (continuationToken);

    console.log("All objects deleted successfully.");
  } catch (error) {
    console.error("Error deleting objects:", error);
  }
}

function listAllObjects(path, token) {
  const params = {
    Prefix: path,
    ContinuationToken: token,
    Bucket: Bucket.WebsiteBucket.bucketName,
  };

  return new Promise((resolve, reject) => {
    s3.listObjectsV2(params, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

function deleteObjects(objects) {
  const deleteParams = {
    Bucket: Bucket.WebsiteBucket.bucketName,
    Delete: {
      Objects: objects.map((obj) => ({ Key: obj.Key })),
      Quiet: true,
    },
  };

  return new Promise((resolve, reject) => {
    s3.deleteObjects(deleteParams, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}
