import { createBrowserRouter } from 'react-router-dom'
import Register from './pages/visitor/Register'
import Login from './pages/visitor/Login'
import ExhibitorList from './pages/visitor/ExhibitorList'
import CheckIn from './pages/visitor/CheckIn'
import Leaderboard from './pages/visitor/Leaderboard'
import MyEligibility from './pages/visitor/MyEligibility'
import OrganizerLogin from './pages/organizer/Login'
import Exhibitors from './pages/organizer/Exhibitors'
import VisitFeed from './pages/organizer/VisitFeed'
import Analytics from './pages/organizer/Analytics'
import LuckyDraw from './pages/organizer/LuckyDraw'
import Settings from './pages/organizer/Settings'
import DataManagement from './pages/organizer/DataManagement'
import VisitorRoute from './guards/VisitorRoute'
import OrganizerRoute from './guards/OrganizerRoute'
import SiteGate from './guards/SiteGate'

export const router = createBrowserRouter([
  { path: '/register', element: <SiteGate><Register /></SiteGate> },
  { path: '/login', element: <SiteGate><Login /></SiteGate> },
  { path: '/', element: <SiteGate><VisitorRoute><ExhibitorList /></VisitorRoute></SiteGate> },
  { path: '/check-in/:exhibitorId', element: <SiteGate><VisitorRoute><CheckIn /></VisitorRoute></SiteGate> },
  { path: '/leaderboard', element: <SiteGate><Leaderboard /></SiteGate> },
  { path: '/my-eligibility', element: <SiteGate><VisitorRoute><MyEligibility /></VisitorRoute></SiteGate> },
  { path: '/organizer/login', element: <OrganizerLogin /> },
  { path: '/organizer', element: <OrganizerRoute><Exhibitors /></OrganizerRoute> },
  { path: '/organizer/feed', element: <OrganizerRoute><VisitFeed /></OrganizerRoute> },
  { path: '/organizer/analytics', element: <OrganizerRoute><Analytics /></OrganizerRoute> },
  { path: '/organizer/draw', element: <OrganizerRoute><LuckyDraw /></OrganizerRoute> },
  { path: '/organizer/users', element: <OrganizerRoute><DataManagement /></OrganizerRoute> },
  { path: '/organizer/settings', element: <OrganizerRoute><Settings /></OrganizerRoute> },
])
