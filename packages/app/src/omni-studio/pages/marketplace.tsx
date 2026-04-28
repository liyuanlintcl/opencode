import { OmniStudioProvider, useOmniStudio } from "../context"
import { MarketplaceSidebar } from "../components/sidebar"
import { MarketplaceList } from "../components/list"
import { MarketplaceDetail } from "../components/detail"
import { LoginPage } from "../components/login-page"

function MarketplaceContent() {
  const { state } = useOmniStudio()

  if (!state.userToken) {
    return <LoginPage />
  }

  return (
    <div class="h-full w-full grid grid-cols-[220px_1fr_380px] bg-background-base">
      <MarketplaceSidebar />
      <MarketplaceList />
      <MarketplaceDetail />
    </div>
  )
}

export default function MarketplacePage() {
  return (
    <OmniStudioProvider>
      <MarketplaceContent />
    </OmniStudioProvider>
  )
}
