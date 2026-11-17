// The Kitchen (board) route's own module, so the budget gate can measure the board on its own
// (scripts/check-bundle-budget.mjs BOARD_ROUTE). Step 5.1 replaces the stand-in with the board.
import PendingPage from './PendingPage'

export default function KitchenPage() {
  return <PendingPage title="Kitchen" icon="home" />
}
