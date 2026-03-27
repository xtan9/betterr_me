import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = key === "authorization" ? value.substring(0, 20) + "..." : value;
  });
  return NextResponse.json({ headers });
}

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = key === "authorization" ? value.substring(0, 20) + "..." : value;
  });
  return NextResponse.json({ headers });
}
