# Serverless Social Cards [![Seed Status](https://api.seed.run/anomaly/social-cards/stages/main/build_badge)](https://console.seed.run/anomaly/social-cards)

A serverless app created with [SST](https://github.com/sst/sst) that dynamically generates social share or Open Graph (OG) images.

## Getting Started

Read the guide on how this service is configured and how you can create your own — [**Dynamically generate social share images with serverless**](https://sst.dev/chapters/dynamically-generate-social-share-images-with-serverless.html).

You can also reference the [example on using the Chromium Lambda Layer](https://sst.dev/examples/how-to-use-lambda-layers-in-your-serverless-app.html).

## Running Locally

Start by installing the dependencies.

``` bash
$ npm install
```

Install the [@sparticuz/chromium](https://github.com/Sparticuz/chromium) layer.

``` bash
$ cd layers/chromium && npm install
```

Then start the Live Lambda Development environment.

``` bash
$ npx sst start
```

The templates to generate the share images are stored in [`templates/`](https://github.com/sst/social-cards/tree/main/templates). And all the non-Latin fonts are placed in [`.fonts/`](https://github.com/sst/social-cards/tree/main/.fonts).

## Deploying to Prod

Deploy your service to prod by running.

``` bash
$ npx sst deploy --stage prod
```

To clear the cache of generated images, invoke the `clear-cache.handler` with the following payload.

```json
{"path":"<template-name>/"}
```

## Documentation

Learn more about the SST.

- [Docs](https://docs.sst.dev/)
- [SST CLI](https://docs.sst.dev/packages/sst)
- [SST Constructs](https://docs.sst.dev/constructs)
