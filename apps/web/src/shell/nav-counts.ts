// What the navigation shows beside a destination (the Stock link carries the number of expired items). The numbers
// come from a container in features/ (this file must not import data/); the nav only reads them.
import { createContext, useContext } from 'react'

export type NavCounts = { expired: number }

export const NO_NAV_COUNTS: NavCounts = { expired: 0 }

export const NavCountsContext = createContext<NavCounts>(NO_NAV_COUNTS)

export const useNavCounts = (): NavCounts => useContext(NavCountsContext)
