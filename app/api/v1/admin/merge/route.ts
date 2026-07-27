import { NextResponse } from "next/server";
import { mergeStories, type StoryEntity } from "../../../../../lib/pipelines/zipper-merge";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sourceIds, targetId } = body || {};

    if (!Array.isArray(sourceIds) || sourceIds.length === 0 || !targetId) {
      return NextResponse.json(
        {
          error: "Invalid merge request. Required arrays of 'sourceIds' and a 'targetId'.",
          code: "ERR_BAD_REQUEST",
          details: { received: body },
        },
        { status: 400 }
      );
    }

    const dummySources: StoryEntity[] = sourceIds.map((id: string, idx: number) => ({
      id,
      title: `Source Story ${idx + 1}`,
      author: "Standard Author",
      synopsis: "Automated aggregation source item.",
    }));

    const dummyTarget: StoryEntity = {
      id: targetId,
      title: "Unified Master Story Entity",
      author: "Standard Author",
      synopsis: "Aggregated master story container.",
    };

    const mergeResult = mergeStories(dummySources, dummyTarget);

    return NextResponse.json({
      success: true,
      mergedItem: mergeResult.mergedItem,
      mergedSourceIds: mergeResult.mergedSourceIds,
      confidence: mergeResult.confidence,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Internal merge error";
    return NextResponse.json(
      {
        error: errorMessage,
        code: "ERR_INTERNAL_MERGE",
      },
      { status: 500 }
    );
  }
}
