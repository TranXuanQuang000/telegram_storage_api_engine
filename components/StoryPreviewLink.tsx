"use client";

import Link from "next/link";
import type { ComponentProps, PointerEvent } from "react";
import type { StoryCardData } from "../lib/catalog";

export const STORY_PREVIEW_KEY = "muc:story-preview";

export type StoryPreviewData = Pick<
  StoryCardData,
  "slug" | "title" | "originTitle" | "coverUrl" | "genres" | "status" | "latestChapter" | "score" | "scoreSource"
> & {
  savedAt: number;
};

type StoryPreviewLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href?: string;
  story: StoryCardData;
};

function rememberStory(story: StoryCardData) {
  try {
    const preview: StoryPreviewData = {
      slug: story.slug,
      title: story.title,
      originTitle: story.originTitle,
      coverUrl: story.coverUrl,
      genres: story.genres.slice(0, 4),
      status: story.status,
      latestChapter: story.latestChapter,
      score: story.score,
      scoreSource: story.scoreSource,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(STORY_PREVIEW_KEY, JSON.stringify(preview));
  } catch {
    // Navigation must keep working when browser storage is unavailable.
  }
}

export function StoryPreviewLink({
  story,
  href = `/story/${story.slug}`,
  onClick,
  onPointerDown,
  ...props
}: StoryPreviewLinkProps) {
  function handlePointerDown(event: PointerEvent<HTMLAnchorElement>) {
    rememberStory(story);
    onPointerDown?.(event);
  }

  return (
    <Link
      {...props}
      href={href}
      onPointerDown={handlePointerDown}
      onClick={(event) => {
        rememberStory(story);
        onClick?.(event);
      }}
    />
  );
}
