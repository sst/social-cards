import { S3, CloudFront } from "aws-sdk";
import { Bucket } from "sst/node/bucket";
import { Config } from "sst/node/config";

const cloudfront = new CloudFront();
const s3 = new S3({ apiVersion: "2006-03-01" });

export async function handler(event) {
  const path = event.path; // Ensure this ends with a slash

  await emptyS3Folder(path);
  await invalidateEntireDistribution(Config.distributionId);
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

async function invalidateEntireDistribution(distributionId) {
  const params = {
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `invalidate-entire-distribution-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: [
          "/*", // This specifies that everything in the distribution should be invalidated
        ],
      },
    },
  };

  try {
    const data = await cloudfront.createInvalidation(params).promise();
    console.log(data);
  } catch (err) {
    console.log(err, err.stack);
  }
}
