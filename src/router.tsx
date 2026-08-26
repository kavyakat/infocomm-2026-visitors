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
import VisitorRoute from './guards/VisitorRoute'
import OrganizerRoute from './guards/OrganizerRoute'

export const router = createBrowserRouter([
  { path: '/register', element: <Register /> },
  { path: '/login', element: <Login /> },
  { path: '/', element: <VisitorRoute><ExhibitorList /></VisitorRoute> },
  { path: '/check-in/:exhibitorId', element: <VisitorRoute><CheckIn /></VisitorRoute> },
  { path: '/leaderboard', element: <VisitorRoute><Leaderboard /></VisitorRoute> },
  { path: '/my-eligibility', element: <VisitorRoute><MyEligibility /></VisitorRoute> },
  { path: '/organizer/login', element: <OrganizerLogin /> },
  { path: '/organizer', element: <OrganizerRoute><Exhibitors /></OrganizerRoute> },
  { path: '/organizer/feed', element: <OrganizerRoute><VisitFeed /></OrganizerRoute> },
  { path: '/organizer/analytics', element: <OrganizerRoute><Analytics /></OrganizerRoute> },
  { path: '/organizer/draw', element: <OrganizerRoute><LuckyDraw /></OrganizerRoute> },
  { path: '/organizer/settings', element: <OrganizerRoute><Settings /></OrganizerRoute> },
])
