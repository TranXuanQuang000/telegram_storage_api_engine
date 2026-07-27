# Novel catalog deployment snapshot

Run `scripts/build_novel_catalog_snapshot.py` before building the production
image. The generated `novel_catalog.snapshot.json.gz` contains public catalog
metadata and chapter manifests only; it does not bundle protected chapter
bodies or comic images.
