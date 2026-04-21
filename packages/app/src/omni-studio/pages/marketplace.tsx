import { OmniStudioProvider } from "../context"
import { MarketplaceSidebar } from "../components/sidebar"
import { MarketplaceList } from "../components/list"
import { MarketplaceDetail } from "../components/detail"

export default function MarketplacePage() {
  return (
    <OmniStudioProvider>
      <div class="h-full w-full grid grid-cols-[220px_1fr_380px] bg-background-base">
        <MarketplaceSidebar />
        <MarketplaceList />
        <MarketplaceDetail />
      </div>
    </OmniStudioProvider>
  )
}
