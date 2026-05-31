# Project Brief

Jeju Radar Training Simulator is a browser-based radar training simulator for procedure-oriented ATC practice.

The project focuses on deterministic training behavior, not operational control:

- Radar-style traffic display for RKPC/Jeju as the first reference airport.
- Procedure guidance for DCT, STAR, SID, ILS, missed approach, holding, and selected visual-flow surfaces.
- Aircraft motion and route progression checks that can be replayed and tested.
- Coordinate authority rules that separate exact, training, and reference-only geometry.
- Scenario replay and phraseology/parser regression contracts.

This repository is an OSS staging version. It intentionally excludes private source documents, local-only evidence, secrets, generated artifacts, and oversized raw geometry.

The engineering bar is that every public feature should be backed by a documented data contract or a deterministic verification script.
