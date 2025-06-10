import { Fn, Duration } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Api, Bucket, Config, Function, StackContext } from "sst/constructs";
import { DnsValidatedCertificate } from "aws-cdk-lib/aws-certificatemanager";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as route53 from "aws-cdk-lib/aws-route53";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";

const rootDomain = "sst.dev";
const domainName = `social-cards.${rootDomain}`;
const layerArn =
  "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:22";

export function MyStack({ stack, app }: StackContext) {
  let hostedZone;
  let domainProps = {};

  const useCustomDomain = app.stage === "prod" || app.stage === "main";

  const layerChromium = new lambda.LayerVersion(stack, "chromiumLayers", {
    code: lambda.Code.fromAsset("layers/chromium"),
  });

  // Create S3 bucket to store generated images
  const bucket = new Bucket(stack, "WebsiteBucket");

  // Create a HTTP API
  const api = new Api(stack, "Api", {
    routes: {
      "GET /{template}/{file}": {
        function: {
          handler: "src/lambda.handler",
          // Increase the timeout for generating screenshots
          timeout: "15 minutes",
          // Increase disk size
          diskSize: "4 GB",
          // Increase the memory
          memorySize: "4 GB",
          // Load Chrome in a Layer
          layers: [layerChromium],
          // Copy over templates and non Latin fonts
          copyFiles: [
            {
              from: "templates",
              to: "templates",
            },
            {
              from: ".fonts",
              to: ".fonts",
            },
          ],
          nodejs: {
            esbuild: {
              // Exclude bundling it in the Lambda function
              external: ["@sparticuz/chromium"],
            },
          },
        },
      },
    },
  });

  api.bind([bucket]);

  if (useCustomDomain) {
    // Lookup domain hosted zone
    hostedZone = route53.HostedZone.fromLookup(stack, "HostedZone", {
      domainName: rootDomain,
    });

    // Create ACM certificate
    const certificate = new DnsValidatedCertificate(stack, "Certificate", {
      domainName,
      hostedZone,
      region: "us-east-1",
    });

    domainProps = {
      ...domainProps,
      certificate,
      domainNames: [domainName],
    };
  }

  // Create CloudFront Distribution
  const distribution = new cf.Distribution(stack, "WebsiteCdn", {
    ...domainProps,
    defaultBehavior: {
      origin: new HttpOrigin(Fn.parseDomainName(api.url)),
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: new cf.CachePolicy(stack, "WebsiteCachePolicy", {
        // Set cache duration to 1 year
        minTtl: Duration.seconds(31536000),
        // Forward the query string to the origin
        queryStringBehavior: cf.CacheQueryStringBehavior.all(),
      }),
    },
  });

  if (useCustomDomain) {
    // Create DNS record
    new route53.ARecord(stack, "AliasRecord", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new CloudFrontTarget(distribution)
      ),
    });
  }

  // Create Function to clear the cache
  const clearFunction = new Function(stack, "ClearCache", {
    handler: "src/clear-cache.handler",
    permissions: ["cloudfront:CreateInvalidation"],
  });

  clearFunction.bind([
    bucket,
    new Config.Parameter(stack, "distributionId", {
      value: distribution.distributionId,
    }),
  ]);

  // Show the endpoint in the output
  stack.addOutputs({
    ApiEndpoint: api.url,
    BucketName: bucket.bucketName,
    SiteEndpoint: `https://${useCustomDomain ? domainName : distribution.distributionDomainName
      }`,
  });
}
