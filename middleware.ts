import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, isValidAdminToken } from './lib/admin-auth';

// Everything under /admin needs the admin password, except the login page.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();
  if (await isValidAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin', '/admin/:path*'] };
