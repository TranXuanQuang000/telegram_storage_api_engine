import { SiteHeader } from "../../../components/SiteHeader";
import { StoryLoadingPreview } from "../../../components/StoryLoadingPreview";

export default function StoryLoading() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <StoryLoadingPreview />
    </div>
  );
}
