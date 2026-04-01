import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/set-password"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get("access_token")?.value;

  if (!accessToken) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-access-secret");
    const { payload } = await jwtVerify(accessToken, secret);

    // If restricted scope, force to set-password
    if (payload.scope === "restricted" && !pathname.startsWith("/set-password")) {
      return NextResponse.redirect(new URL("/set-password", req.url));
    }

    // Pass user info via headers to server components
    const response = NextResponse.next();
    response.headers.set("x-user-erp", payload.erp_id as string);
    response.headers.set("x-user-role", payload.base_role as string);
    if (payload.dept_id) response.headers.set("x-user-dept", String(payload.dept_id));
    return response;
  } catch {
    // Token expired or invalid — let the client-side interceptor handle refresh
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
