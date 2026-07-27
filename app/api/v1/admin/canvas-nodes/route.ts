import { NextResponse } from "next/server";

export async function GET() {
  const nodes = [
    {
      id: "source-mangadex-101",
      type: "source",
      data: {
        sourceName: "MangaDex Engine",
        domain: "api.mangadex.org",
        title: "Solo Leveling (Thăng Cấp Vô Song)",
        chapters: "Chương 1 - 179",
        consentStatus: "VERIFIED",
        status: "active",
        itemCount: 179,
        jaccardMatch: 0.96,
        pHashMatch: 0.94,
        confidence: 0.952,
        position: { x: 80, y: 120 },
      },
    },
    {
      id: "source-otruyen-102",
      type: "source",
      data: {
        sourceName: "OTruyen Aggregator",
        domain: "otruyenapi.com",
        title: "Tôi Thăng Cấp Một Mình",
        chapters: "Chương 1 - 175 (Khuyết 4-7)",
        consentStatus: "VERIFIED",
        status: "has_gap",
        itemCount: 171,
        missingGaps: [4, 5, 6, 7],
        jaccardMatch: 0.91,
        pHashMatch: 0.89,
        confidence: 0.902,
        position: { x: 80, y: 380 },
      },
    },
    {
      id: "source-wikisource-103",
      type: "source",
      data: {
        sourceName: "WikiSource Archives",
        domain: "vi.wikisource.org",
        title: "Truyện Kiều - Nguyễn Du",
        chapters: "Khúc 1 - 3254 (Toàn văn)",
        consentStatus: "VERIFIED",
        status: "active",
        itemCount: 3254,
        jaccardMatch: 1.0,
        pHashMatch: 1.0,
        confidence: 1.0,
        position: { x: 80, y: 640 },
      },
    },
    {
      id: "target-unified-solo-leveling",
      type: "unified",
      data: {
        title: "Solo Leveling (Unified Record)",
        mergedSourcesCount: 2,
        totalChapters: 179,
        gapResolved: true,
        consentStatus: "VERIFIED",
        overallConfidence: 0.948,
        position: { x: 520, y: 250 },
      },
    },
    {
      id: "target-unified-truyen-kieu",
      type: "unified",
      data: {
        title: "Truyện Kiều (Bản Chuẩn Quốc Ngữ)",
        mergedSourcesCount: 1,
        totalChapters: 3254,
        gapResolved: true,
        consentStatus: "VERIFIED",
        overallConfidence: 1.0,
        position: { x: 520, y: 640 },
      },
    },
    {
      id: "gap-alert-node-4-7",
      type: "gap_alert",
      data: {
        missingChapters: [4, 5, 6, 7],
        sourceId: "source-otruyen-102",
        donorSourceId: "source-mangadex-101",
        suggestedAction: "Auto-Zipper Merge from MangaDex",
        confidence: 0.96,
        position: { x: 300, y: 460 },
      },
    },
  ];

  const edges = [
    {
      id: "edge-mangadex-to-unified",
      source: "source-mangadex-101",
      target: "target-unified-solo-leveling",
      data: { confidence: 0.952, status: "merged" },
    },
    {
      id: "edge-otruyen-to-unified",
      source: "source-otruyen-102",
      target: "target-unified-solo-leveling",
      data: { confidence: 0.902, status: "pending_gap_fill" },
    },
    {
      id: "edge-gap-alert",
      source: "source-otruyen-102",
      target: "gap-alert-node-4-7",
      data: { status: "alert" },
    },
    {
      id: "edge-wikisource-to-unified",
      source: "source-wikisource-103",
      target: "target-unified-truyen-kieu",
      data: { confidence: 1.0, status: "merged" },
    },
  ];

  return NextResponse.json(
    { nodes, edges },
    { headers: { "Cache-Control": "public, max-age=10, s-maxage=30" } }
  );
}
