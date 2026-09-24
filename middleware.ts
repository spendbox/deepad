import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, isValidAdminToken, PLANNER_COOKIE, readPlannerToken } from './lib/auth';

// /dashboard needs a planner login; /admin needs the DashPad admin password.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const url = req.nextUrl.clone();
  url.search = '';

  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') return NextResponse.next();
    if (await isValidAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }

  if (await readPlannerToken(req.cookies.get(PLANNER_COOKIE)?.value)) return NextResponse.next();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin', '/admin/:path*', '/dashboard', '/dashboard/:path*'] };
