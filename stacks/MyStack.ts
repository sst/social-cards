import { Fn, Duration } from "aws-cdk-lib";
import { Api, Bucket, StackContext } from "sst/constructs";
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
          // Load Chrome in a Layer
          layers: [layerArn],
          environment: {
            // Set $HOME for OS to pick up the non Latin fonts
            // from the .fonts/ directory
            HOME: "/var/task",
          },
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
              external: ["chrome-aws-lambda"],
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

  // Show the endpoint in the output
  stack.addOutputs({
    ApiEndpoint: api.url,
    BucketName: bucket.bucketName,
    SiteEndpoint: `https://${
      useCustomDomain ? domainName : distribution.distributionDomainName
    }`,
  });
}
