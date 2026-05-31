# Data License

This document explains the licensing boundary for data files committed in this repository, including JSON, CSV, and GeoJSON files under `data/` and phraseology fixtures under `phraseology_contract/data/`.

## Repository-Authored Data

Repository-authored data that is not derived from third-party aeronautical publications is made available under the Creative Commons Attribution 4.0 International License (CC BY 4.0), unless a file states otherwise. This includes synthetic scenario seeds, simulator-only fixtures, and maintainer-authored validation metadata.

License text:

<https://creativecommons.org/licenses/by/4.0/>

## AIP-Derived Reference Data

Some reference values, procedure identifiers, route structures, coordinates, or validation metadata may be derived from publicly accessible aeronautical information publications or other upstream public sources.

Those upstream-derived facts and references are provided only as training-simulator fixtures with source traceability and operational disclaimers. This repository does not grant a new license to the underlying upstream source material and does not claim that AIP-derived reference data is freely reusable under CC BY 4.0.

Users who reuse AIP-derived reference data outside this repository are responsible for checking and following the original publisher's terms.

## What This Does Not License

This repository does not redistribute or relicense upstream source documents, official aeronautical publications, private PDFs, SOPs, training manuals, local notes, or source corpora.

Any upstream source named or implied by the data remains governed by its original publisher's terms. Users are responsible for checking those terms before reusing the data outside this repository.

## Operational Restriction

The data is provided only for software development, training simulation, research, and verification.

It is not an operational aviation data source. Do not use it for real-world air traffic control, aircraft navigation, dispatch, certification, regulatory compliance, or safety-critical decision making.

## Attribution

If you reuse repository-authored data covered by CC BY 4.0, attribute it as:

> Jeju Radar Training Simulator contributors, derived training simulator dataset.

For AIP-derived reference data, also preserve the original source attribution, this file, and the repository disclaimer.
